# Current Patch — Web 0.20.0

`0.20.0 — Production Release Certification / Launch Baseline` is a certification-only release on top of Web 0.19.9.

It adds a single launch certification command, a source contract for the frozen launch invariants, and launch handoff/validation documentation. It does not change database schema, campaign/send semantics, gateway/SIM behavior, auth/session/workspace rules, PWA fetch strategy, observability privacy rules, accessibility interactions or the 0.19.6-r1 bundle budgets.

Use `npm run certify:0200`, then `git diff --check`, `./scripts/release-package.sh` and the explicit post-deploy smoke checklist.
