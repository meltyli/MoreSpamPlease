"use strict";

const LOG = "[MoreSpamPlease]";
const ALARM_NAME = "scan-junk";
const SCAN_INTERVAL_MINUTES = 5;
const MAX_MESSAGES_PER_SCAN = 50;

let scanInProgress = false;

async function getMessageIds(folderId, limit) {
  const ids = [];
  let page = await messenger.messages.list(folderId);

  while (true) {
    const remaining = limit - ids.length;

    ids.push(
      ...page.messages.slice(0, remaining).map(m => m.id)
    );

    if (!page.id) break;

    if (ids.length >= limit) {
      await messenger.messages.abortList(page.id);
      break;
    }

    page = await messenger.messages.continueList(page.id);
  }

  return ids;
}

async function rescueMessage(messageId, junk, inbox) {
  let message;

  try {
    message = await messenger.messages.get(messageId);
  } catch {
    return false;
  }

  if (message.folder?.id !== junk.id) {
    return false;
  }

  await messenger.messages.update(messageId, {
    junk: false
  });

  let updated;

  try {
    updated = await messenger.messages.get(messageId);
  } catch {
    console.warn(`${LOG} Message ID changed after update.`);
    return false;
  }

  if (updated.folder?.id === inbox.id) {
    return true;
  }

  if (updated.folder?.id !== junk.id) {
    console.warn(`${LOG} Message moved elsewhere. Skipping.`);
    return false;
  }

  await messenger.messages.move(
    [messageId],
    inbox.id
  );

  return true;
}

async function scanAllAccounts(reason) {
  if (scanInProgress) return;

  scanInProgress = true;
  let rescued = 0;

  console.log(`${LOG} Scan started: ${reason}`);

  try {
    const accounts = await messenger.accounts.list();

    for (const account of accounts) {
      if (rescued >= MAX_MESSAGES_PER_SCAN) break;

      try {
        const [junkFolders, inboxFolders] = await Promise.all([
          messenger.folders.query({
            accountId: account.id,
            specialUse: ["junk"]
          }),
          messenger.folders.query({
            accountId: account.id,
            specialUse: ["inbox"]
          })
        ]);

        if (!junkFolders.length || inboxFolders.length !== 1) {
          continue;
        }

        const inbox = inboxFolders[0];

        for (const junk of junkFolders) {
          if (rescued >= MAX_MESSAGES_PER_SCAN) break;

          const remaining = MAX_MESSAGES_PER_SCAN - rescued;
          const messageIds = await getMessageIds(junk.id, remaining);

          for (const messageId of messageIds) {
            try {
              const success = await rescueMessage(
                messageId,
                junk,
                inbox
              );

              if (success) {
                rescued++;
                console.log(
                  `${LOG} Rescued message: ${account.id} -> ${inbox.name}`
                );
              }
            } catch (error) {
              console.error(
                `${LOG} Failed processing message in ${account.id}:`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.error(`${LOG} Account ${account.id}:`, error);
      }
    }

    console.log(`${LOG} Scan complete. Rescued: ${rescued}`);
  } catch (error) {
    console.error(`${LOG} Scan failed:`, error);
  } finally {
    scanInProgress = false;
  }
}

messenger.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    scanAllAccounts("scheduled");
  }
});

messenger.messages.onNewMailReceived.addListener(
  folder => {
    if (folder.specialUse?.includes("junk")) {
      scanAllAccounts("new junk mail");
    }
  },
  true
);

messenger.messages.onMoved.addListener(
  (originalMessages, movedMessages) => {
    const movedToJunk = movedMessages.messages.some(
      message => message.folder?.specialUse?.includes("junk")
    );

    if (movedToJunk) {
      scanAllAccounts("message moved to junk");
    }
  }
);

async function initialize() {
  const existingAlarm = await messenger.alarms.get(ALARM_NAME);

  if (!existingAlarm) {
    messenger.alarms.create(ALARM_NAME, {
      periodInMinutes: SCAN_INTERVAL_MINUTES
    });
  }

  console.log(`${LOG} Automatic processing enabled.`);

  await scanAllAccounts("startup");
}

initialize().catch(error => {
  console.error(`${LOG} Initialization failed:`, error);
});