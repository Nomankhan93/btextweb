# Handoff — Web 0.20.1

Frontend: `0.20.1`
Backend contract: `0.18.5`
Database migration: none

## Install behavior

- BulkText does not fake installability.
- The automatic prompt appears only after the browser emits `beforeinstallprompt`.
- Already-installed standalone mode does not offer installation.
- **Not now** suppresses the automatic prompt for three days.
- The public navigation keeps a manual **Install App** action while the browser still reports installability.

## Update behavior

- New service workers are checked after registration, reconnect and foreground return.
- New builds download in the background through the normal service-worker lifecycle.
- A waiting worker shows **BulkText update ready** globally.
- **Later** dismisses that worker's prompt for the current page session.
- **Update now** sends `SKIP_WAITING`; BulkText reloads once after `controllerchange`.
- No forced activation/reload occurs during the service-worker `install` event.

Run `npm run certify:0201`, then `git diff --check` and `./scripts/release-package.sh`.

Do not run `supabase db push` for Web 0.20.1.
