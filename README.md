# Web 0.20.3 — Auth Screen Mobile Polish

BulkText Web `0.20.3` polishes the mobile sign-in and create-account experience while preserving the certified authentication/session contract. The release aligns both screens to one top-aligned auth shell, reduces signup vertical bulk, unifies input states, adds accessible password visibility controls, improves pending/loading presentation, and softens secondary-link hierarchy.

The existing BulkText navy/blue/cyan identity, logo, tagline, Supabase authentication calls, redirects, password requirements, verification flow, recovery flow, session handling, public landing page, `0.20.1` PWA install/update lifecycle, and `0.20.2` landing conversion work remain intact.

Frontend version is `0.20.3`; backend contract remains `0.18.5`. No database migration or Android change is included. The service-worker cache version advances only so installed clients receive the updated static auth assets.

Run `npm run certify:0203` in WSL on Node `24.21.0`, then `git diff --check` and `./scripts/release-package.sh`.

See `PATCH_0_20_3_README.md`, `HANDOFF_0_20_3.md`, `VALIDATION_0_20_3.md` and `docs/AUTH_SCREEN_MOBILE_POLISH_0203.md`.
