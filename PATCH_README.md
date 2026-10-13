# Current Patch — Web 0.20.3

`0.20.3 — Auth Screen Mobile Polish` improves the sign-in and create-account screens without changing BulkText authentication behavior or backend contracts.

## Included
- one consistent top-aligned mobile auth shell instead of vertically centering the shorter sign-in card;
- tighter signup copy, spacing, brand block and heading scale;
- unified 56px white input treatment with subtle focus/autofill states;
- shared accessible show/hide password control with a 44×44px target;
- compact password guidance and softer secondary-link hierarchy;
- explicit pending states that disable form controls and show spinner + action text;
- short-screen and 320–360px responsive guards;
- focused 0.20.3 source/runtime certification plus auth/accessibility regressions.

## Not included
No Supabase migration, authentication API change, redirect/session change, password-rule change, email-verification change, recovery-flow change, landing-page redesign, PWA lifecycle change, campaign/send behavior change, or Android gateway change.

## Validate
```bash
nvm use 24.21.0
npm ci
npm run certify:0203
git diff --check
./scripts/release-package.sh
```
