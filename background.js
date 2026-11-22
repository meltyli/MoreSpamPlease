"use strict";

const PREFIX = "[MoreSpamPlease]";
const ALARM = "msp-periodic-scan";
const DEFAULT_CONFIG = { automatic: true, minutes: 10 };
const SETTLE_DELAY_MS = 15000;
const RETRY_DELAY_MS = 2000;

let config = { ...DEFAULT_CONFIG };
let scanPromise = null;
let lastRun = null;
let status = {
    phase: "idle",
    stage: null,
    reason: null,
    account: null,
    queued: 0,
    examined: 0,
    rescued: 0,
    failed: 0,
    skipped: 0,
    lastError: null
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function configureAlarm(force = false) {
    const old = await messenger.alarms.get(ALARM);
    if (!config.automatic) {
        if (old) await messenger.alarms.clear(ALARM);
        return;
    }

    if (force || !old || old.periodInMinutes !== config.minutes) {
        messenger.alarms.create(ALARM, {
            delayInMinutes: config.minutes,
            periodInMinutes: config.minutes
        });
    }
}

async function getState() {
    const alarm = await messenger.alarms.get(ALARM);
    return {
        config: { ...config },
        status: { ...status },
        lastRun,
        nextScan: config.automatic ? (alarm?.scheduledTime ?? null) : null
    };
}

async function getFolderMessageIds(folderId) {
    const ids = [];
    let page = await messenger.messages.list(folderId);
    while (true) {
        ids.push(...page.messages.map(message => message.id));
        if (!page.id) return ids;
        page = await messenger.messages.continueList(page.id);
    }
}

async function getMessageOrNull(messageId) {
    try {
        return await messenger.messages.get(messageId);
    } catch {
        return null;
    }
}

async function rescueMessage(messageId, junkId, inboxId) {
    const original = await getMessageOrNull(messageId);
    if (!original || original.folder?.id !== junkId) return "skipped";

    await messenger.messages.update(messageId, { junk: false });

    const updated = await getMessageOrNull(messageId);
    if (!updated) return "skipped";
    if (updated.folder?.id === inboxId) return "rescued";
    if (updated.folder?.id !== junkId) return "skipped";

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await messenger.messages.move([messageId], inboxId);
            return "rescued";
        } catch (error) {
            if (attempt === 2) throw error;
            console.warn(`${PREFIX} Move failed; retrying once after 2 seconds:`, error);
            await sleep(RETRY_DELAY_MS);
            const current = await getMessageOrNull(messageId);
            if (!current || current.folder?.id !== junkId) return "skipped";
        }
    }
}

function recordError(context, error) {
    status.failed++;
    status.lastError = `${context}: ${String(error?.message || error)}`;
    console.error(`${PREFIX} ${status.lastError}`);
}

async function collectQueue() {
    const queue = [];
    const accounts = await messenger.accounts.list();

    for (const account of accounts) {
        status.account = account.name || account.id;
        try {
            const [junkFolders, inboxFolders] = await Promise.all([
                messenger.folders.query({ accountId: account.id, specialUse: ["junk"] }),
                messenger.folders.query({ accountId: account.id, specialUse: ["inbox"] })
            ]);

            if (!junkFolders.length || inboxFolders.length !== 1) {
                console.log(`${PREFIX} Skipped account ${account.id}: no unambiguous Junk/Inbox pairing.`);
                continue;
            }

            const inboxId = inboxFolders[0].id;
            for (const junk of junkFolders) {
                try {
                    const ids = await getFolderMessageIds(junk.id);
                    for (const id of ids) {
                        queue.push({ id, junkId: junk.id, inboxId, account: account.name || account.id, folder: junk.name });
                    }
                } catch (error) {
                    recordError(`${account.id}/${junk.name}: folder listing`, error);
                }
            }
        } catch (error) {
            recordError(`${account.id}: folder discovery`, error);
        }
    }

    status.account = null;
    status.queued = queue.length;
    console.log(`${PREFIX} Queue collected: ${queue.length} messages.`);
    return queue;
}

async function scan(reason) {
    status = {
        phase: "processing", stage: "collecting", reason, account: null,
        queued: 0, examined: 0, rescued: 0, failed: 0, skipped: 0,
        lastError: null
    };
    console.log(`${PREFIX} Scan started (${reason}).`);

    try {
        const queue = await collectQueue();

        if (queue.length && reason !== "manual") {
            status.stage = "settling";
            await sleep(SETTLE_DELAY_MS);
        }

        status.stage = "moving";
        for (const item of queue) {
            status.account = item.account;
            status.examined++;
            try {
                const result = await rescueMessage(item.id, item.junkId, item.inboxId);
                status[result]++;
            } catch (error) {
                recordError(`${item.account}/${item.folder}: message ${item.id}`, error);
            }
        }
    } catch (error) {
        recordError("queue collection", error);
    } finally {
        const finished = {
            at: Date.now(), reason: status.reason,
            examined: status.examined,
            rescued: status.rescued,
            failed: status.failed,
            skipped: status.skipped,
            lastError: status.lastError
        };
        lastRun = finished;
        status.phase = "idle";
        status.stage = null;
        status.account = null;
        console.log(`${PREFIX} Scan complete.`, finished);
        try {
            await messenger.storage.local.set({ lastRun: finished });
        } catch (error) {
            console.error(`${PREFIX} Failed saving last-run summary:`, error);
        }
    }
    return getState();
}

function startScan(reason) {
    if (scanPromise) return scanPromise;
    scanPromise = scan(reason).finally(() => { scanPromise = null; });
    return scanPromise;
}

async function saveConfig(payload) {
    if (typeof payload?.automatic !== "boolean") {
        throw new Error("Invalid automatic setting");
    }
    const minutes = Number(payload.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        throw new Error("Frequency must be whole number from 1 to 1440 minutes");
    }
    config = { automatic: payload.automatic, minutes };
    await messenger.storage.local.set({ config });
    await configureAlarm(true);
    return getState();
}

messenger.runtime.onMessage.addListener(message => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "getState") return ready.then(getState);
    if (message.type === "saveConfig") {
        return ready.then(() => saveConfig(message.config));
    }
    if (message.type === "startNow") {
        return ready.then(() => startScan("manual"));
    }
    return false;
});

messenger.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== ALARM) return;
    return ready.then(() => {
        if (config.automatic) return startScan("scheduled");
    });
});

const ready = (async () => {
    const saved = await messenger.storage.local.get({
        config: DEFAULT_CONFIG,
        lastRun: null
    });
    const savedMinutes = Number(saved.config?.minutes);
    config = {
        automatic: typeof saved.config?.automatic === "boolean"
            ? saved.config.automatic : DEFAULT_CONFIG.automatic,
        minutes: Number.isInteger(savedMinutes) && savedMinutes >= 1 && savedMinutes <= 1440
            ? savedMinutes : DEFAULT_CONFIG.minutes
    };
    lastRun = saved.lastRun;
    await configureAlarm();
    console.log(`${PREFIX} Ready. Automatic: ${config.automatic}; every ${config.minutes} minutes.`);
})().catch(error => {
    console.error(`${PREFIX} Initialization failed:`, error);
    throw error;
});
