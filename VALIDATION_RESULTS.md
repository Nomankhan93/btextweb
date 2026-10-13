# Validation — Web 0.20.1

Web 0.20.1 preserves the certified 0.20.0 launch baseline and adds focused install/update lifecycle gates.

The new source contract verifies genuine browser installability, installed-mode hiding, three-day prompt suppression, manual install availability, background update checks, explicit `SKIP_WAITING` activation, single reload on controller change, global prompt mounting, and retention of the existing service-worker/offline safety boundaries.

Runtime certification is consolidated under `npm run certify:0201` and must be performed in WSL on Node `24.21.0`.

Deployment smoke should verify:
- normal mobile-browser visit shows **Install BulkText App** when Chrome reports installability;
- **Not now** dismisses the automatic card;
- the hamburger navigation retains **Install App** while the app remains installable;
- installed standalone mode does not show install actions;
- a deployed newer service worker downloads in the background and shows **BulkText update ready**;
- **Later** keeps the current session running;
- **Update now** activates the waiting worker and reloads once.
