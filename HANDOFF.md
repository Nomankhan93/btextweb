# Current Handoff — Web 0.20.0

Current frontend release: `0.20.0`
Backend contract: `0.18.5`

`0.20.0 — Production Release Certification / Launch Baseline` freezes the approved Web behavior and consolidates the production launch gates. There is no database migration and no new product workflow.

Primary certification command: `npm run certify:0200`. After it passes, run `git diff --check` and `./scripts/release-package.sh`. Post-deploy browser/PWA and real Android gateway smoke must still be performed explicitly.
