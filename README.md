# Web 0.20.0 — Production Release Certification / Launch Baseline

BulkText Web `0.20.0` is the production launch baseline. It freezes the approved `0.19.x` behavior and consolidates the critical release gates for artifact integrity, auth/session/workspace boundaries, privacy-safe observability, accessibility/forms, PWA/offline behavior, route-loading performance and the full frontend regression suite.

Frontend version is `0.20.0`; backend contract remains `0.18.5`. No database migration or product-workflow change is included.

Run `npm run certify:0200` in WSL on Node `24.21.0`, then `git diff --check` and `./scripts/release-package.sh`. Deployment/device smoke remains an explicit post-deploy launch checklist item and is not represented as completed by the source artifact.

See `PATCH_0_20_0_README.md`, `HANDOFF_0_20_0.md`, `VALIDATION_0_20_0.md` and `docs/PRODUCTION_LAUNCH_BASELINE_0200.md`.
