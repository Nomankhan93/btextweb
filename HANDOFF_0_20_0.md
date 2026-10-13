# Handoff — Web 0.20.0

Frontend: `0.20.0`
Backend contract: `0.18.5`
Database migration: none

This release establishes the production launch baseline. The release is ready to package only after `npm run certify:0200` and `git diff --check` pass. The packaged source is ready to deploy only after the hardened release packager passes. Launch completion additionally requires explicit post-deploy browser/PWA and Android-gateway smoke.

Do not run `supabase db push` for Web 0.20.0.
