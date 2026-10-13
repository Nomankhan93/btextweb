# Web 0.18.6 — Draft Reliability, Imports & Campaign UX

Frontend release 0.18.6 targets backend contract 0.18.5. There is no new SQL migration, cloud deployment, data reset, or Android change in this patch.

## Draft reliability

- Workspace loading depends on account ID, not the transient auth user object. Same-account token refresh no longer unmounts routed forms. Explicit workspace refresh keeps an existing form mounted and displays recoverable errors.
- Account changes hide the old workspace immediately; late responses cannot replace a newer account's workspace. An initial session lookup cannot overwrite a newer sign-out event.
- The New campaign form saves title, message, parsed recipients/mapping, evidence reference, prepared snapshot identifiers and saved draft ID in sessionStorage, scoped to account + workspace. It survives same-tab navigation/reload. This is tab recovery, not a cross-device/cloud backup; browser session restoration may retain a tab. Signing out clears campaign recovery storage. Discard draft removes the tab copy only; existing server records remain for audit.
- Recipients contain personal data. No localStorage, analytics or logging of recipient content is added. Tab storage may be unavailable or exceed its 1.5-million-character budget; then stale storage is removed and the UI warns that recovery is unavailable. The page warns on browser unload during active writes or when unsaved recovery failed.
- Prepared recipients are fetched again before a restored form can enter review. Failed reads can be retried without losing the saved draft ID. A restored unprepared list requires a fresh consent checkbox confirmation.
- Saving for review reuses the existing draft ID and preserves exact message whitespace. Changing recipients starts a new draft identity and requires consent again while retaining message/title.
- A synchronous operation lock prevents duplicate clicks. Multi-step preparation stops starting subsequent requests after its form unmounts. Successfully returned import/preview/consent/snapshot results are reused during retries with unchanged inputs while that screen stays mounted.
- Limits: a request already sent cannot be cancelled by leaving the page. A lost response after a committed server write cannot be distinguished from a failed write without backend idempotency; reload also loses partial preparation checkpoints. Check Recent uploads/saved drafts before retrying ambiguous failures. No exactly-once write guarantee is claimed.

## Imports

- Cancelling the file chooser or rejecting a replacement preserves the previous parsed list. A successful replacement resets consent and prepared state. Mapping controls lock during writes; low-confidence mapping is expanded and sample rows are available in New campaign.
- CSV supports CRLF/LF/CR line endings and BOM-marked UTF-16, plus UTF-8. Invalid encoding and malformed quoted-field suffixes fail with actionable errors.
- Duplicate/generated headers remain unique, prototype-named fields are preserved, and extra data columns get generated headers. More than 100 columns is rejected rather than silently discarded. Recognizable headerless phone lists are rejected with instructions to add headers.
- XLSX no longer stops at an internal run of 1,000 blank rows or undercounts overflow after title rows. More than 5,000 recipient rows remains blocked. Nonempty columns beyond the supported width fail explicitly.
- **Superseded by Web 0.20.4:** the historical 5,000-row / 5 MB product caps are removed; large imports now use bounded database staging batches.
- XLSX validates directory/data bounds and duplicate entries, rejects encrypted archives, caps advertised expanded archive size at 40 MB and each read entry at 20 MB, and checks actual streamed decompression sizes.
- Existing first-sheet-only XLSX behavior is now stated visibly. To import another sheet, move it first or export it as CSV. Legacy XLS, arbitrary legacy CSV encodings and headerless mode remain unsupported.

## Campaign review

- Review waits for both draft/device data and personalization rows, ignores stale loads after leaving the route, and shows read failures with Retry review instead of misleading Draft not found.
- With multiple active devices the sender must choose the phone. A single active device is preselected. Active registration is labelled Paired, not Connected; last-seen time and bound SIM remain visible.
- Edit draft returns to the matching recovered New campaign form when available; otherwise the composer now actually loads the requested saved draft from its URL.
- Composer edits must be saved before Review & confirm becomes available, preventing review of stale server text. Confirm campaign clearly freezes a snapshot; it does not send. Existing server consent, suppression, SIM and queue guards are unchanged.

## Acceptance on the real deployment

1. Start a campaign, switch tabs away/back and refresh auth; title/list/message should remain.
2. Reload the same tab; prepared recipient reads must finish before review. Sign out and switch accounts; no prior account draft should appear.
3. Try a malformed replacement file, cancel the picker, then upload a valid replacement. Only the successful replacement should clear consent.
4. Review a saved draft, edit text, save and return. Check exact message, recipient count, SMS estimate, chosen phone and SIM.
5. Confirmation must not send. Perform any actual send only as a separate authorized test to your own test recipient.

Automated DOM tests mock APIs; they do not prove hosted PostgREST, browser-native XLSX decompression across all browsers, carrier delivery, or real-device behavior. Retain the existing 0.18.5 delivery-contract checks.
