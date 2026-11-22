"use strict";

const PREFIX = "[MoreSpamPlease]";
const ALARM = "msp-periodic-scan";
const DEFAULT_CONFIG = { automatic: true, minutes: 10 };
const RETRY_DELAY_MS = 2000;

let config = { ...DEFAULT_CONFIG };
let scanPromise = null;
let lastRun = null;
let status = {
  phase: "idle",
  reason: null,
  account: null,
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
  // Take a snapshot of message IDs before changing the folder.
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

  // Updating junk status can itself move a message. Message IDs change on moves.
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

async function scan(reason) {
  status = {
    phase: "processing", reason, account: null,
    examined: 0, rescued: 0, failed: 0, skipped: 0, lastError: null
  };
  console.log(`${PREFIX} Scan started (${reason}).`);

  try {
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
          let ids;
          try {
            ids = await getFolderMessageIds(junk.id);
          } catch (error) {
            recordError(`${account.id}/${junk.name}: folder listing`, error);
            continue;
          }

          for (const id of ids) {
            status.examined++;
            try {
              const result = await rescueMessage(id, junk.id, inboxId);
              status[result]++;
            } catch (error) {
              recordError(`${account.id}/${junk.name}: message ${id}`, error);
            }
          }
        }
      } catch (error) {
        recordError(`${account.id}: folder discovery`, error);
      }
    }
  } catch (error) {
    recordError("account listing", error);
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

function recordError(context, error) {
  status.failed++;
  status.lastError = `${context}: ${String(error?.message || error)}`;
  console.error(`${PREFIX} ${status.lastError}`);
}

function startScan(reason) {
  if (scanPromise) return scanPromise;
  scanPromise = scan(reason).finally(() => { scanPromise = null; });
  return scanPromise;
}

async function saveConfig(payload) {
  if (typeof payload.automatic !== "boolean") {
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

// Register listeners synchronously for Thunderbird's MV3 event page.
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
