"use strict";

const LOG = "[MoreSpamPlease]";
const TEST_ACCOUNT_ID = "account4";
const TEST_SUBJECT = "MoreSpamPlease TEST";

async function testUnspam() {
  const accounts = await messenger.accounts.list();
  const account = accounts.find(a => a.id === TEST_ACCOUNT_ID);

  if (!account) {
    throw new Error(`Account ${TEST_ACCOUNT_ID} not found`);
  }

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
    throw new Error("Missing or ambiguous Junk/Inbox folders");
  }

  const inbox = inboxFolders[0];

  for (const junk of junkFolders) {
    let page = await messenger.messages.list(junk.id);

    while (true) {
      const message = page.messages.find(
        m => m.subject === TEST_SUBJECT
      );

      if (message) {
        console.log(`${LOG} Test message found in ${junk.name}`);

        await messenger.messages.update(message.id, {
          junk: false
        });

        console.log(`${LOG} Marked Not Junk`);

        // Check whether Thunderbird already moved the message.
        const updated = await messenger.messages.get(message.id);

        if (!updated) {
          console.warn(`${LOG} Message ID changed. Check Inbox.`);
          return;
        }

        if (updated.folder?.id === inbox.id) {
          console.log(`${LOG} Already moved to Inbox`);
          return;
        }

        if (updated.folder?.id !== junk.id) {
          console.warn(`${LOG} Message changed folders. Stopping.`);
          return;
        }

        await messenger.messages.move(
          [message.id],
          inbox.id
        );

        console.log(`${LOG} SUCCESS: Moved to ${inbox.name}`);
        return;
      }

      if (!page.id) break;
      page = await messenger.messages.continueList(page.id);
    }
  }

  console.warn(`${LOG} Test message not found`);
}

testUnspam().catch(error => {
  console.error(`${LOG} Test failed:`, error);
});