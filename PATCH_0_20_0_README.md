# BulkText Web 0.20.0 — Production Release Certification / Launch Baseline

## Scope

Certification-only release. No new user workflow, backend migration, RLS/RPC change, gateway/SIM protocol change, PWA fetch-strategy change or UI redesign.

## Automated launch gate

Run:

```bash
npm run certify:0200
```

This executes the launch source contract, preflight, focused accessibility/auth/observability/bootstrap regressions, TypeScript check, full Vitest suite, production build, bundle budget and PWA shell integrity.

Then run:

```bash
git diff --check
./scripts/release-package.sh
```

The deterministic packager re-runs source/stage/extracted preflight, manifest verification, ZIP layout checks and path/secret scans.

## Manual launch evidence

Deployment and physical-device smoke are intentionally not auto-marked PASS. Complete the checklist in `docs/PRODUCTION_LAUNCH_BASELINE_0200.md` after deployment.
