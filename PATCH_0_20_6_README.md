# BulkText Web 0.20.6 — Home Dashboard Control Center

This release rebuilds Home/Dashboard around one operational sending summary instead of repeated setup cards.

## What changed

- Removed the duplicate Dashboard `New campaign` action; Home now has one primary campaign CTA.
- Removed the old Next Action and Current identity sections.
- Added one `Sending setup` module containing gateway health, phone, selected SIM, and prepared-recipient state.
- Replaced generic gateway `Ready` wording with the existing live health state.
- Reduced recipient preparation and message drafts to two compact utility modules.
- Added the latest three confirmed campaigns using the existing `listCampaignConfirmations` API.
- Removed the dashboard-specific PWA install card so the existing global install/update prompt is the authoritative PWA surface.
- Changed dashboard loading to partial-failure isolation with `Promise.allSettled`; successful sections remain usable when one read fails.
- Added 0.20.6 dashboard source and Vitest regression contracts.

## Apply

Apply this patch to the supplied clean `0.20.5-r1` baseline:

```bash
bash /path/to/bulktext-web-0.20.6-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0
cd /home/noman/projects/bulktext-web-0.4.0
npm ci
npm run certify:0206
git diff --check
```

The patch installer verifies baseline hashes for files it replaces and creates a timestamped backup before writing.

## Database / Android

No new migration. Backend contract remains `0.18.5`. No Android change is included.

## Deployment check

After frontend deployment, accept the controlled PWA update and verify Home on desktop and mobile:

- one New campaign CTA;
- correct phone/SIM and gateway health;
- prepared-recipient and draft counts;
- recent campaign rows;
- graceful partial state when one dashboard read is temporarily unavailable.
