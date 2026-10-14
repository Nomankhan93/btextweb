# Validation — BulkText Web 0.20.12

## Executed in the artifact environment

- Node 24.19.0; locked npm dependencies retained from the supplied project.
- TypeScript semantic check and Vite production build: PASS.
- Complete Vitest suite: 50 files, 252 tests PASS; no excluded tests or hanging suites.
- All 28 source-contract scripts and project preflight: PASS.
- Backend SQL/migration files and dependency version specifications: unchanged from supplied baseline.

Source-contract assertions are supplemental; the semantic build and behavioral tests were also executed. Regression coverage includes final-send duplicate prevention and cancellation, technical-queue confirmation, dialog focus preservation, queued-not-sending presentation, polling failure, wizard navigation, draft restoration, personalization and capped previews.

## Browser/device limitation

Visual desktop/mobile browser acceptance was NOT completed. Playwright was available, but its Chromium and headless-shell downloads returned HTML instead of executable ZIP archives. A browser-fixture harness was prepared but could not launch. No browser screenshots or visual PASS claims are included. No hosted Supabase, physical Android device or live carrier SMS acceptance was performed.

## Local validation

```bash
npm ci
npm run certify:02012
git diff --check
```

The certification command runs all source contracts, preflight, TypeScript, the complete Vitest suite, production build and the service-worker shell simulation. Complete the browser/mobile and controlled real-device acceptance listed in README.md after deployment.

## Early handoff

User requested stopping additional validation and receiving ZIPs immediately. Installer runtime/rollback/end-to-end chain certification was not completed. The new consolidated installer is supplied with baseline/payload guards and backups, but is not claimed as runtime-certified. The previously completed full tests and production build results above remain valid.
