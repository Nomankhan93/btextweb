# BulkText Web 0.16.3 — Validation Results

## Scope

Simple Campaign Flow + Smart Number Import on top of Web 0.16.2 / Cloud 00320 / Android 0.17.0.

## Completed in artifact environment

- package version `0.16.3`: **PASS**
- `npm run preflight`: **PASS**
- TypeScript `tsc --noEmit`: **PASS**
- TS/TSX syntax transpilation: **PASS**
- smart-import core compile: **PASS**
- content-based CSV phone detection/normalization: **PASS**
- real `HAMZA DATA.xlsx` smart-import acceptance: **PASS**
  - meaningful source rows: `1400`
  - detected phone column: `Contact`
  - detected display-name column: `name`
  - valid phones: `1400`
  - invalid: `0`
  - duplicates: `0`
- old migrations through `20261001000320`: expected to remain byte-for-byte unchanged (verified during release packaging)
- exactly one new migration: `20261001000330_simple_campaign_flow_bulk_consent.sql`
- deterministic clean release packaging/checksum verification: performed during final packaging

## Environment limitation

The artifact container has Node 22.16.0 rather than the project's pinned Node 24.21.0. A fresh `npm ci` cannot complete because external NPM registry/network access is unavailable in this environment. The available TypeScript compiler can type-check the project, but local `vitest`/`vite` binaries cannot be freshly installed here.

Therefore the following must be rerun in the user's WSL environment with Node 24.21.0 before commit/deployment:

```bash
nvm use || nvm install
npm ci
npm run validate
npm audit
git diff --check
```

## Database deployment gate

Before DB push:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

Expected: hosted history aligned through `20261001000320` and **only `20261001000330` pending**. Do not push if any other unexpected migration appears.

After review:

```bash
npx supabase db push
npx supabase migration list
```

No Android 0.17 or 0.18 code is part of this Web patch.
