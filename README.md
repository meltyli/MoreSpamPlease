# MoreSpamPlease

Thunderbird 160+ extension. Moves messages from each account's special-use Junk folder into that same account's Inbox and marks them Not Junk.

## Controls

- **Start Now:** scan Junk folders immediately, even when automation is disabled.
- **Automatic processing:** default enabled, every 10 minutes. Change interval (1–1440 minutes) from toolbar popup.
- **Status:** shows current processing state, account, message counts, last run and last failure.
- **Retries:** after a move failure, retries once after two seconds; further failures remain for later scans.

Does not monitor Junk folder move events. This avoids racing immediately with user/provider IMAP operations. Scheduled scans run only while Thunderbird can run extensions.

## Install for development

1. Thunderbird → Add-ons and Themes → gear → Debug Add-ons.
2. Load Temporary Add-on → select `manifest.json`.
3. Open **MoreSpamPlease** in Thunderbird unified toolbar.
4. Check statuses; use **Start Now**.

Temporary add-ons disappear on Thunderbird restart. Packaging and permanent installation require an XPI, and Thunderbird may require signing/approval.

## Limits and security

- Only special-use Junk folders identified by Thunderbird are processed.
- Accounts without exactly one Inbox are skipped.
- Marking Not Junk and moving to Inbox does not guarantee server-side spam filtering is trained.
- IMAP servers can reject or delay moves. Errors are reported; successful API calls alone do not guarantee downstream server synchronization has finished.
- This extension deliberately returns actual spam and phishing messages to Inbox. Keep Thunderbird's phishing and attachment protections enabled.
- No analytics, remote servers, libraries, or message-content reading.
