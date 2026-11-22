"use strict";

async function discoverAccounts() {
  try {
    const accounts = await messenger.accounts.list();

    console.log(`[MoreSpamPlease] Found ${accounts.length} accounts.`);

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

        console.log(`[MoreSpamPlease] Account: ${account.id} (${account.type})`, {
          junkFolders: junkFolders.map(folder => folder.name),
          inboxFolders: inboxFolders.map(folder => folder.name)
        });

        if (junkFolders.length > 0 && inboxFolders.length === 1) {
          console.log(`[MoreSpamPlease] ${account.id}: Ready`);
        } else {
          console.warn(`[MoreSpamPlease] ${account.id}: Missing or ambiguous folders`);
        }
      } catch (error) {
        console.error(`[MoreSpamPlease] ${account.id}:`, error);
      }
    }
  } catch (error) {
    console.error("[MoreSpamPlease] Discovery failed:", error);
  }
}

discoverAccounts();