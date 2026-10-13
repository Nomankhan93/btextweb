# Web 0.20.1 — PWA Install & Update Experience

BulkText Web `0.20.1` improves how the web app is installed and updated without changing the approved `0.20.0` launch workflow.

When the browser exposes a genuine PWA install prompt, BulkText now shows a branded **Install BulkText App** prompt across public, auth and workspace routes. Users can install immediately or choose **Not now**; automatic prompting is suppressed for three days while the manual **Install App** option remains available on the public navigation when the browser still reports the app as installable. Installed standalone mode does not show an install offer.

Service-worker updates continue to download in the background. A waiting update is surfaced globally as **BulkText update ready** with **Update now** and **Later**. BulkText never forces a mid-session reload: activation occurs only after explicit **Update now**, then the page reloads once on `controllerchange`.

Frontend version is `0.20.1`; backend contract remains `0.18.5`. No database migration, send-workflow, gateway/SIM, auth/session/workspace, or PWA fetch-strategy change is included.

Run `npm run certify:0201` in WSL on Node `24.21.0`, then `git diff --check` and `./scripts/release-package.sh`.

See `PATCH_0_20_1_README.md`, `HANDOFF_0_20_1.md`, `VALIDATION_0_20_1.md` and `docs/PWA_INSTALL_UPDATE_EXPERIENCE_0201.md`.
