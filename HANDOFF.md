# Current Handoff — Web 0.20.2

Current frontend release: `0.20.2`
Backend contract: `0.18.5`

`0.20.2 — Landing Page Conversion & Mobile UX` is a presentation-focused public-landing patch on top of the certified `0.20.1` PWA install/update release.

The page now leads with **Business SMS, sent from your own SIM.**, shows the campaign/dashboard proof before explanatory sections, removes the separate repetitive product-visibility section, compresses the four-step workflow and six-feature list, limits the comparison to infrastructure/cost/routing, uses a vertical Android architecture flow on narrow screens, and provides an explicit accessible FAQ accordion.

The mobile public menu now closes with Escape, restores focus to its trigger, prevents background scrolling while open, and retains the conditional `0.20.1` **Install App** action. No PWA install/update lifecycle logic is changed.

Primary certification command: `npm run certify:0202`. After it passes, run `git diff --check` and `./scripts/release-package.sh`.

No database migration is included.
