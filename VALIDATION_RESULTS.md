# BulkText 0.12.1 Validation Results

## Artifact-side checks

- source/migration review: PASS
- `npm run preflight`: PASS
- JavaScript `.mjs` syntax checks: PASS
- TypeScript `npm run check`: PASS in the artifact environment
- legacy organization/team frontend files removed: PASS
- local regression scripts migrated away from `create_organization`: PASS
- Vitest/Vite build: not completed in the artifact environment because dependency installation timed out before the local Vitest/Vite executables were installed
- local Supabase acceptance: must be run in the user's WSL environment with BulkText Supabase on port 56321

## Required local acceptance

```bash
npm install
npx supabase start
npx supabase migration up --local
npm run validate:local
npm audit
```

Expected critical result:

```text
BulkText 0.12.1 INDIVIDUAL ACCOUNT TRANSITION PASS
```

Do not start 0.13 until the 0.12.1 migration and the complete local validation suite pass.
