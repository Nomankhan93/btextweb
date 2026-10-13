# BulkText Web 0.20.1 — PWA Install & Update Experience

## Scope

Post-launch PWA UX hardening only. No database migration, campaign/send workflow change, Android gateway/SIM protocol change, auth/session/workspace change, service-worker fetch-strategy change, or UI redesign outside the install/update experience.

## Install experience

When Chrome/another supporting browser dispatches `beforeinstallprompt`, BulkText captures the event and shows a branded, non-modal install card:

- **Install App** opens the browser-owned installation dialog.
- **Not now** suppresses automatic prompting for three days.
- Manual **Install App** remains in public navigation while the browser still reports the app as installable.
- `appinstalled` and standalone display mode hide install actions.

BulkText does not show a fake install button when the browser does not expose a real install prompt.

## Update experience

The service worker keeps the safe waiting-worker model:

- update checks run after registration, reconnect and foreground return;
- new assets download through the normal service-worker lifecycle;
- a waiting worker shows **Update now / Later** globally;
- **Later** does not repeatedly re-open for the same waiting worker in the current page session;
- **Update now** posts `SKIP_WAITING`;
- a single reload occurs after `controllerchange`;
- `install` never calls `skipWaiting()` automatically.

## Certification

Run:

```bash
npm run certify:0201
git diff --check
./scripts/release-package.sh
```

The 0.20.0 launch baseline gates, 0.19.6-r1 bundle budgets, PWA shell integrity, full Vitest suite, and source/stage/ZIP release scans remain mandatory.
