# Current Handoff — Web 0.20.3

Current frontend release: `0.20.3`
Backend contract: `0.18.5`

`0.20.3 — Auth Screen Mobile Polish` is a presentation-focused authentication UI patch on top of the certified `0.20.2` landing release.

Sign in and create account now share the same top-aligned mobile shell, compact spacing, 56px input/button rhythm, unified white input states and softer card treatment. Create-account copy is shorter. Password fields on these two screens use one shared visibility control with explicit Show/Hide labels, `aria-pressed`, a 44px target, and no submit behavior. Pending sign-in/signup states disable form controls while preserving the existing AuthProvider calls and redirects.

The auth/session boundary, Supabase calls, password rules, recovery/verification behavior, public landing page, PWA install/update lifecycle, campaigns, Android gateway and database are unchanged.

Primary certification command: `npm run certify:0203`. After it passes, run `git diff --check` and `./scripts/release-package.sh`.

No database migration is included.
