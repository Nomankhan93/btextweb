# Validation — Web 0.20.3

Web 0.20.3 preserves the certified 0.20.2 baseline and adds focused auth-screen mobile polish gates.

Automated certification is consolidated under `npm run certify:0203` and should be run in WSL on Node `24.21.0` before release packaging. The dedicated source/runtime tests protect the shared auth shell, password visibility accessibility, signup password guidance, pending-state safety, existing public auth routes, auth/session boundary, accessibility forms, landing 0.20.2 and PWA 0.20.1 regressions.

Deployment smoke should verify sign-in and signup on 320/360/390/412px-class mobile widths, top alignment consistency, natural scrolling with the keyboard open, show/hide password behavior, autofill appearance, loading/disabled states and unchanged login/signup navigation outcomes.
