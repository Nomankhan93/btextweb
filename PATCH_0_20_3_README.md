# Web 0.20.3 — Auth Screen Mobile Polish

## Baseline
Built on certified Web `0.20.2 — Landing Page Conversion & Mobile UX`.

Frontend version: `0.20.3`  
Backend contract: `0.18.5`  
Database migration: **none**  
Android change: **none**

## What is included
- shared top-aligned mobile auth shell for sign in and signup;
- reduced mobile card/heading/brand spacing and shorter signup supporting copy;
- consistent white input surfaces, 56px controls and softer focus/autofill treatment;
- reusable `PasswordField` for sign in/signup with Show/Hide semantics;
- preserved signup password-help association;
- explicit disabled/loading UI while auth requests are pending;
- 320px/short-height responsive guards;
- focused 0.20.3 certification and regressions.

## Preserved contracts
- AuthProvider owns Supabase sign-in/signup calls;
- login returnTo safety and redirects are unchanged;
- signup email-confirmation routing is unchanged;
- minimum password length remains 8 characters;
- forgot/reset/verify flows are not behaviorally changed;
- backend remains 0.18.5;
- no schema/RLS/migration change;
- 0.20.1 PWA install/update and 0.20.2 landing behavior remain regression-gated.
