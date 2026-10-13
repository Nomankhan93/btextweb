# Handoff — Web 0.20.3

`0.20.3 — Auth Screen Mobile Polish` refines sign-in and create-account presentation only.

The mobile auth card is no longer vertically centered on short forms. Both screens begin from the same safe-area-aware top rhythm and scroll naturally. Inputs/buttons use a consistent compact mobile scale, password visibility is accessible, and pending submissions disable the relevant controls.

No auth/session/Supabase contract was changed. No database migration or Android release is required.

Run:
```bash
nvm use 24.21.0
npm ci
npm run certify:0203
git diff --check
./scripts/release-package.sh
```
