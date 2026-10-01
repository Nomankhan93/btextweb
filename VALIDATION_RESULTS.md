# BulkText Web 0.7.0 — Validation Results

## Artifact/static validation

- [ ] package version is `0.7.0`
- [ ] previous migration checksums unchanged
- [ ] forward migration `20260930000230_device_dashboard_sim_binding.sql` present
- [ ] installer compatibility check passes against clean 0.6.0 baseline
- [ ] TypeScript check passes
- [ ] Vitest passes
- [ ] production build passes
- [ ] patch payload excludes `.env`, Supabase temp/runtime secrets and build artifacts

## Local Supabase integration gate

Run after applying the migration to isolated BulkText local Supabase:

```bash
npm run validate:local
```

Expected:

```text
BulkText 0.7.0 RBAC REGRESSION PASS
BulkText 0.7.0 SECURE PAIRING REGRESSION PASS
BulkText 0.7.0 DEVICE DASHBOARD & SIM BINDING LOCAL PASS
```

The 0.7 suite must prove:

- wrong gateway credential cannot report inventory;
- valid device credential can report Android metadata + dual-SIM inventory;
- SIM tables are not directly readable by anon/browser users;
- organization members can view own dashboard but not another tenant;
- Analyst cannot bind a SIM;
- Owner/Admin can bind a present SIM;
- disappearance of the selected SIM produces `missing` and never auto-selects another SIM;
- an absent SIM cannot be newly bound;
- explicit re-binding to a present SIM succeeds;
- explicit unbind succeeds;
- binding changes appear in the audit ledger;
- revoked gateway cannot report inventory.

## Physical Android gate (separate)

Web/Cloud 0.7 is not fully production-ready until the actual Android gateway reports real SIM inventory and the no-fallback behavior is verified on physical hardware.
