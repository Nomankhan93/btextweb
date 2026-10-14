# Validation — BulkText Web 0.20.10

## Artifact-build validation

- 0.20.10 Campaign Delivery Experience source contract: PASS (46 assertions).
- retained 0.20.9 Message & Review source contract: PASS.
- retained 0.20.8 Campaign Wizard source contract: PASS.
- retained 0.20.7 Confirmation & Send Safety source contract: PASS.
- project preflight: PASS.
- touched TS/TSX syntactic transpilation: PASS.
- CSS parse: PASS.
- all 27 source-contract suites: PASS.
- clean source ZIP manifest/path/secret/extracted-preflight verification: PASS.
- guarded patch apply/idempotency: PASS.
- patched payload byte comparison: PASS (53/53 release files).

## WSL certification

Run:

```bash
npm ci
npm run certify:02010
git diff --check
```

Certification includes the focused delivery regressions, retained send-safety regressions, full Vitest suite, TypeScript project check and production build.

## Browser acceptance

Verify:

- live campaign status changes without page reload;
- Android received is not called SENT;
- Known SENT is not called DELIVERED;
- processed progress excludes unresolved UNKNOWN;
- all-DELIVERED campaign shows Delivery confirmed;
- unresolved UNKNOWN shows Needs attention;
- UNKNOWN recovery uses branded confirmation and never offers resend;
- attempt-history numbers are masked;
- manual refresh and offline status continue to work.
