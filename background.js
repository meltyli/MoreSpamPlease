"use strict";

const LOG = "[MoreSpamPlease]";

async function scanJunkFolders() {
  const accounts = await messenger.accounts.list();

  let totalMessages = 0;
  let totalFolders = 0;

  console.log(`${LOG} Starting dry run.`);

  for (const account of accounts) {
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
        console.warn(`${LOG} Skipping ${account.id}: Missing or ambiguous folders.`);
        continue;
      }

      const inbox = inboxFolders[0];

      for (const junk of junkFolders) {
        try {
          let count = 0;
          let page = await messenger.messages.list(junk.id);

          while (true) {
            count += page.messages.length;

            if (!page.id) break;

            page = await messenger.messages.continueList(page.id);
          }

          totalMessages += count;
          totalFolders++;

          console.log(
            `${LOG} ${account.id}: ${count} messages`,
            `${junk.name} -> ${inbox.name}`
          );
        } catch (error) {
          console.error(`${LOG} Failed scanning ${account.id}/${junk.name}:`, error);
        }
      }
    } catch (error) {
      console.error(`${LOG} Account ${account.id} failed:`, error);
    }
  }

  console.log(
    `${LOG} Dry run complete: ${totalMessages} messages across ${totalFolders} folders.`
  );
}

scanJunkFolders().catch(error => {
  console.error(`${LOG} Fatal error:`, error);
});