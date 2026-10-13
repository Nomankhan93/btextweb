# Current Handoff — Web 0.20.1

Current frontend release: `0.20.1`
Backend contract: `0.18.5`

`0.20.1 — PWA Install & Update Experience` adds a branded install prompt and user-controlled update activation on top of the certified `0.20.0` launch baseline.

Install prompting appears only when the browser provides `beforeinstallprompt`; already-installed standalone mode does not offer installation. **Not now** suppresses automatic prompting for three days without removing the manual landing-navigation **Install App** action while installability remains available.

Updates are checked after service-worker registration, reconnect, focus and visible-tab return. A waiting worker shows **Update now / Later** globally. BulkText does not force `skipWaiting()` during service-worker install and does not reload until the user chooses **Update now**.

Primary certification command: `npm run certify:0201`. After it passes, run `git diff --check` and `./scripts/release-package.sh`.

No database migration is included.
