# Handoff — BulkText Web 0.20.12

Direct integration from 0.20.5-r1. All six frontend patch payloads are included with corrections. Do not layer the old patches over this release.

Safety invariants: immutable confirmed recipient/message/phone/SIM snapshot; explicit final confirmation before enqueueing on every visible queue path; fresh backend preflight → authorization → enqueue; immediate duplicate-submit guard; no fallback SIM; no automatic resend of UNKNOWN or callback failures; offline writes remain blocked.

Dashboard refresh dependencies use workspace ID rather than object identity. Phone & SIM downgrades failed refreshes to “Status unavailable” while keeping last-known cards. A review SIM label is not a fresh send-authorization claim. Pending attempts alone do not mean SMS sending has started.

ActionDialog uses stable open/close focus lifecycle and latest callbacks, and unique accessible IDs. Wizard step changes focus the section. Recipient expansion is explicitly limited to the first 100 and does not repeat the initial three.

Run npm run certify:02012. Database and Android code need no deployment for this patch. See VALIDATION_0_20_12.md for execution evidence and unperformed browser/device acceptance.

# BulkText Web 0.20.12 — Frontend Cleanup Integration & Corrections

This release integrates frontend releases 0.20.6–0.20.11 and their audit corrections into one patch for the supplied, unpatched **0.20.5-r1** project. Do not apply the six older patches first.

## Included changes

- Compact Home dashboard with partial-failure isolation, recent campaigns, stable workspace dependencies and visible-tab refresh.
- Focused campaign wizard, compact imports/consent/message summaries, safe personalization controls and deliberate step focus.
- Campaign review with masked recipient previews, accurate first-100 expansion without duplicate rows, and an honest “SIM selected” label.
- One final sending confirmation for both the main and technical queue actions. Both run fresh eligibility/phone/exact-SIM checks before authorization and enqueueing. Cancel never enqueues.
- Delivery presentation distinguishes waiting/receipt/active sending, SENT, DELIVERED and UNKNOWN; unresolved UNKNOWN is not counted as complete and never automatically resent.
- Phone & SIM control center with stale/unavailable-state handling, secondary pairing, compact SIM rows and collapsed technical/history sections.
- Stable dialog keyboard focus across parent updates, Escape/Tab behavior and return-to-opener handling.
- Corrected semantic TypeScript errors, regression fixtures/selectors, release markers and obsolete message metric CSS.

## Apply in Ubuntu / WSL

Prerequisites: Python 3 and Node 24 (use your pinned Node 24 installation). Start from the supplied 0.20.5-r1 baseline. Preserve local work; the installer refuses mismatched files instead of overwriting edits.

```bash
bash /path/to/bulktext-web-0.20.12-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0 --dry-run
bash /path/to/bulktext-web-0.20.12-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0
cd /home/noman/projects/bulktext-web-0.4.0
npm ci
npm run certify:02012
git diff --check
```

The installer verifies metadata, payload and baseline hashes; takes a timestamped backup; writes through temporary files with atomic replacement; verifies installed bytes and preflight; and restores the baseline on caught installation failures. A successful repeated apply is a no-op. No installation command sends SMS, deploys the app or changes the database.

Rollback (only before editing installed release files):

```bash
bash /path/to/bulktext-web-0.20.12-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0 --rollback /home/noman/projects/bulktext-web-0.4.0/.patch-backups/EXACT-BACKUP-NAME
```

## Release boundary

Frontend **0.20.12**; backend contract **0.18.5**. Existing database migrations, RPCs and Android source are unchanged. Existing account data, credentials and environment files are preserved. Old release documents are historical; this README, PATCH_0_20_12_README.md and VALIDATION_0_20_12.md describe the current release.

## Acceptance after deployment

Check desktop and mobile: Home partial failure, unpaired/recent/stale/offline Phone & SIM, SIM selection/cancel, all campaign steps and draft restoration, review expansion, final confirmation/cancel, waiting/sent/delivered/UNKNOWN presentation, keyboard focus, and controlled PWA update. A fixture or unit test does not substitute for a real phone/carrier acceptance test. Use only your controlled test recipient when testing real SMS.
