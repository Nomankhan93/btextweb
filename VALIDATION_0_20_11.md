# Validation — BulkText Web 0.20.11

## Artifact-build validation

- 0.20.11 Phone & SIM Readiness Control Center source contract: **PASS (56 assertions)**.
- retained 0.20.10 Campaign Delivery source contract: **PASS**.
- retained 0.20.9 Message & Review source contract: **PASS**.
- retained 0.20.8 Campaign Wizard source contract: **PASS**.
- retained 0.20.7 Confirmation & Send Safety source contract: **PASS**.
- all **28** source-contract suites: **PASS**.
- project preflight: **PASS**.
- touched TS/TSX syntactic transpilation using available global TypeScript: **PASS**.
- CSS parse using available PostCSS: **PASS**.
- clean source release path/secret/manifest/extracted-preflight verification: **PASS**.
- guarded 0.20.10 → 0.20.11 patch apply: **PASS**.
- automatic backup: **PASS (50 replaced baseline files)**.
- patch idempotent second apply: **PASS**.
- patched release byte comparison: **PASS (58/58 release files)**.

## Dependency-environment limitation

The clean artifact has no `node_modules`. Offline install in the artifact environment cannot complete because the npm cache is missing `yallist-3.1.1.tgz`. Run semantic TypeScript, Vitest and Vite build in the normal WSL project:

```bash
npm ci
npm run certify:02011
git diff --check
```

## Browser acceptance

Verify:

- no phone: pairing is the primary action;
- recent + selected present SIM: Ready to send;
- stale/offline phone: Phone needs attention, not Ready;
- unbound phone: Choose a SIM;
- missing selected SIM: Selected SIM missing;
- Pair another phone is secondary once a phone is active;
- Device details hides diagnostics by default;
- SIM switch uses branded confirmation and explains exact-SIM impact;
- Unselect SIM and Disconnect phone use branded confirmations;
- previous phones and pairing history are collapsed;
- mobile page has no horizontal overflow.

## Release boundary

Frontend `0.20.11`; backend contract `0.18.5`; no SQL migration; no Android change.
