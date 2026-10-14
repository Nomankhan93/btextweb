# BulkText Web 0.20.7 — Campaign Confirmation & Send Safety UX

This release hardens the user-facing boundary between confirming a frozen campaign and starting real SMS sending.

## What changed

- Replaced the campaign confirmation `window.confirm()` with a branded accessible dialog.
- Kept confirmation and sending separate; the confirmation UI explicitly says that nothing is sent yet.
- Replaced the main `Send to Android` action with `Start sending to N recipients`.
- Added a branded final-send dialog summarizing campaign, recipients, estimated SMS, phone, and SIM before the existing safety sequence runs.
- Added immediate client-side duplicate-submit protection with `sendInFlight` in addition to existing backend idempotency.
- Preserved fresh preflight → fresh authorization → durable queue ordering.
- Moved the primary send action near the top of the confirmed campaign page.
- Removed internal `Subscription` from the primary confirmed sending summary; exact subscription data remains in Technical send details.
- Moved delivery implementation/safety copy out of the normal page into collapsed technical diagnostics.
- Fixed confirmed-recipient mobile horizontal overflow by converting the wide table to labeled stacked rows on narrow screens.
- Added focused source and Vitest regression contracts for confirmation/send safety and dialog keyboard behavior.

## Apply

Apply this patch to BulkText Web `0.20.6`:

```bash
bash /path/to/bulktext-web-0.20.7-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0
cd /home/noman/projects/bulktext-web-0.4.0
npm ci
npm run certify:0207
git diff --check
```

The patch installer verifies baseline hashes for files it replaces and creates a timestamped backup before writing.

## Database / Android

No new migration. Backend contract remains `0.18.5`. No Android change is included.

## Deployment check

After frontend deployment and controlled PWA update, verify in desktop and mobile browsers:

- branded `Confirm campaign?` dialog and `Nothing will be sent yet` wording;
- confirmed campaign shows the send action near the top;
- `Start sending to N recipients` opens the final branded confirmation;
- rapid repeated activation does not duplicate the authorize/enqueue client sequence;
- a failed final phone/SIM check queues nothing;
- frozen recipients are readable on narrow screens without horizontal clipping;
- Technical send details remain collapsed by default.
