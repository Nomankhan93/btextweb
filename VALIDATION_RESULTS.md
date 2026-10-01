# BulkText Web 0.11.0 — Validation Results

## Artifact/build-time checks

- [x] 0.10.0 source baseline used for development
- [x] forward migration added; migrations through `20261001000030` remain immutable
- [x] `npm run preflight` PASS
- [x] `npm run check` PASS
- [x] all local integration scripts pass `node --check`
- [x] consent/suppression helper smoke test PASS
- [x] no new runtime dependency required
- [x] package dependency and devDependency sets unchanged
- [x] package-lock dependency graph unchanged apart from version metadata in the development baseline
- [x] installer compatibility/apply tested against a clean 0.10.0 baseline
- [x] installer preserves `@supabase/supabase-js ^2.117.2`
- [x] installer regenerates `SHA256SUMS.txt`
- [x] patch excludes `.env`, Supabase runtime state, `node_modules`, `dist` and local backups

## Local Supabase acceptance implemented

`npm run test:consent-suppression-local` covers:

- no-consent default block;
- consent evidence requirement;
- Owner/Admin/Campaign Manager write permissions;
- Analyst read-only current-state access;
- manager-only detailed evidence history;
- grant, revoke and expiry states;
- suppression override;
- Campaign Manager suppression / Owner-Admin-only lift;
- cross-tenant isolation;
- raw-table browser write blocking;
- immutable eligibility snapshot revisions;
- later compliance events not mutating older snapshots;
- audit events.

## Environment-dependent final gates

The build environment could type-check the source but did not complete a fresh dependency installation for Vitest/Vite. Run the normal project gates after applying the patch:

```bash
npm install
npm run validate
npm audit
```

For a local Supabase acceptance environment:

```bash
npm run validate:local
```

For hosted Supabase, verify the linked BulkText project and then apply only the forward migration with the normal `supabase db push` workflow. Do not run `db reset` against the hosted project.
