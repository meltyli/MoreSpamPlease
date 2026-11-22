"use strict";

const LOG = "[MoreSpamPlease]";
const TEST_SUBJECT = "PASTE EXACT SUBJECT HERE";

async function testUnspam() {
  const accounts = await messenger.accounts.list();

  for (const account of accounts) {
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
      let page = await messenger.messages.list(junk.id);

      while (true) {
        const message = page.messages.find(
          m => m.subject === TEST_SUBJECT
        );

        if (message) {
          console.log(`${LOG} Found test message in ${account.id}`);

          await messenger.messages.update(message.id, {
            junk: false
          });

          console.log(`${LOG} Marked Not Junk`);

          // Marking Not Junk may itself move the message.
          let updated;

          try {
            updated = await messenger.messages.get(message.id);
          } catch (error) {
            console.warn(
              `${LOG} Message ID unavailable after update. Check Inbox.`,
              error
            );
            return;
          }

          if (updated.folder?.id === inbox.id) {
            console.log(`${LOG} Already in Inbox`);
            return;
          }

          if (updated.folder?.id !== junk.id) {
            console.warn(`${LOG} Message moved elsewhere. Stopping.`);
            return;
          }

          await messenger.messages.move(
            [message.id],
            inbox.id
          );

          console.log(`${LOG} SUCCESS: ${account.id} -> Inbox`);
          return;
        }

        if (!page.id) break;
        page = await messenger.messages.continueList(page.id);
      }
    }
  }

  console.warn(`${LOG} Test message not found in any Junk folder`);
}

testUnspam().catch(error => {
  console.error(`${LOG} Test failed:`, error);
});