# Current Patch — Web 0.20.1

`0.20.1 — PWA Install & Update Experience` is a post-launch UX patch on top of the certified Web 0.20.0 baseline.

It adds:
- a global branded install prompt when the browser genuinely exposes PWA installability;
- a three-day **Not now** suppression window;
- a public-navigation **Install App** action that remains available while installable;
- global update-ready prompting with **Update now / Later**;
- background update checks after registration, reconnect and foreground return;
- explicit update activation only after user approval;
- regression coverage for install visibility, installed-mode hiding, deferral, and `SKIP_WAITING` activation.

It does not change the service-worker fetch strategy, offline send safety, campaign/send semantics, Android gateway behavior, auth/session/workspace rules, database schema, RLS/RPCs, or the bundle budgets.

Use `npm run certify:0201`, then `git diff --check` and `./scripts/release-package.sh`.
