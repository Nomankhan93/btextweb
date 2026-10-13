# Validation — Web 0.20.2

Primary automated gate: `npm run certify:0202`.

The certifier covers:
1. 0.20.2 landing source contract;
2. 0.20.2 landing runtime behavior;
3. 0.20.1 install/update source + runtime regressions;
4. production-launch source contract;
5. preflight;
6. accessibility/forms regressions;
7. auth/session/workspace regressions;
8. observability/privacy regressions;
9. bootstrap/lazy-routing regressions;
10. TypeScript;
11. full Vitest suite;
12. production build;
13. bundle budget;
14. PWA shell integrity.

After certification, run `git diff --check` and `./scripts/release-package.sh`. Deployed mobile-browser smoke remains required for visual density and real browser installability.
