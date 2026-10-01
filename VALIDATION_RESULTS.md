# BulkText Web 0.12.0 — Validation Results

## Artifact/build-time checks

- [x] 0.11.0 source baseline used for development
- [x] forward migration added; migrations through `20261001000040` remain immutable
- [x] `npm run preflight` PASS
- [x] all TypeScript/TSX source files pass syntax transpilation
- [x] message-composer helper compiles standalone under strict TypeScript and passes smoke checks
- [x] all local integration scripts pass `node --check`
- [x] no new runtime dependency required
- [x] package dependency and devDependency sets unchanged
- [x] package-lock dependency graph remains unchanged apart from version metadata
- [x] installer compatibility/apply tested against a clean 0.11.0 baseline
- [x] installer preserves `@supabase/supabase-js ^2.117.2`
- [x] installer regenerates `SHA256SUMS.txt`
- [x] patch excludes `.env`, Supabase runtime state, `node_modules`, `dist` and local backups

## Local Supabase acceptance implemented

`npm run test:composer-local` covers:

- latest 0.12 schema metadata and downstream execution gates disabled;
- anonymous composer RPC denial;
- tenant and role fixtures;
- eligible recipient snapshot as the only composer source;
- eligible source rows retaining name/phone/custom fields;
- Analyst read-only behavior;
- Owner/Admin/Campaign Manager draft mutation;
- malformed/unsupported token rejection by the backend;
- server-derived template-variable storage;
- direct authenticated table-write blocking;
- cross-tenant isolation;
- create/update audit events;
- draft deletion without changing eligibility snapshots.

Earlier regression scripts were advanced to expect the 0.12 schema version while retaining their feature-specific assertions.

## Environment-dependent final gates

The build environment did not complete a fresh npm dependency installation, so full project type-check/Vitest/Vite build must be run after applying the patch:

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
