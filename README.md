<p align="center">
   <a href ="https://github.com/meltyli/MoreSpamPlease">
      <img src="https://raw.githubusercontent.com/meltyli/MoreSpamPlease/refs/heads/main/icon.png" alt="logo" width="128">
   </a>
</p>

# From one human to another

Hey, thanks for checking out my project. I just made this because my email providers would just randomly send my stuff to spam and then stuff that should be spam is not being put in the trash or junk. It's just a mess and I got sick of it. My use case is to completely manually sort my emails because I don't trust any system to safely mark things are spam (h0w can I trust my own implementation??).

If you have issues with it, click the issues tab at the top and then send me a message.

Everything after this is just AI summarizing my words because I'm not very good at talking.

---

# MoreSpamPlease

Minimal Thunderbird 160+ extension. Marks messages in each account's special-use Junk folder as Not Junk, then moves them to that account's Inbox.

## Controls

Thunderbird → Add-ons and Themes → MoreSpamPlease → Preferences / Options.

- **Start Now:** scan all Junk folders immediately, even if automatic processing is disabled.
- **Automatic processing:** enabled by default. Runs every 10 minutes (configurable: 1–1440 minutes).
- **Status:** Idle / Collecting / Settling / Processing, account, counts, last run and last error.
- **Retry:** failed moves retry once after 2 seconds; remaining messages picked up next scan.

## Scan behaviour

1. Gather a full queue of message IDs from all accounts' special-use Junk folders.
2. For automatic scans, wait 15 seconds before attempting moves; Start Now skips this delay.
3. Re-check each message's source folder, mark Not Junk, then move to same account's Inbox.
4. Print start, queue size, errors, and completion summary to extension console. No per-message success logs.
5. Rebuild queue on next scan. No persistent work queue; interrupting a scan doesn't delete mail.

**Note:** The 15-second delay is only a settling pause, not proof that Thunderbird/IMAP synchronisation is idle or complete. IMAP operations can still fail and be retried on later runs. Scheduled scans only operate while Thunderbird can run the extension.

## Install for development

1. Thunderbird → Add-ons and Themes → gear → Debug Add-ons.
2. Load Temporary Add-on → select `manifest.json`.
3. In Add-ons and Themes, select **MoreSpamPlease**, then **Preferences / Options**.
4. Test with harmless messages moved to Junk in two accounts. Click **Start Now**.
5. Inspect extension logs through Debug Add-ons → Inspect.

On upgrade from v0.2, delete old `popup.html`, `popup.js`, `popup.css` files from repository; no toolbar button is used. Settings in `storage.local` persist when reloading an extension with the same ID.

Temporary add-ons are removed when Thunderbird restarts. Permanent installation may require signing and review.

## Limits and security

- Only special-use Junk folders identified by Thunderbird are processed.
- Accounts without exactly one Inbox are skipped.
- Marking Not Junk and moving to Inbox does not guarantee server-side spam filtering is trained.
- IMAP servers can reject or delay moves. A successful API call does not prove server synchronisation is complete.
- This extension deliberately returns actual spam and phishing to Inbox. Keep Thunderbird's phishing and attachment protections enabled.
- No telemetry, remote services, dependencies, or message-body reading.
