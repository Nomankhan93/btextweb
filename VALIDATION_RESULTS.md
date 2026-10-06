# BulkText Web / Cloud 0.18.0 — Validation Results

Builder-side checks:

- package/preflight version: 0.18.0
- TypeScript source structure: checked
- delivery status helper tests: included
- forward migration inventory: exactly one new migration, 00340
- prior migrations through 00330: required unchanged by patch installer
- schema verifier updated through 00340
- no automatic UNKNOWN retry path added
- safe retry requires zero successful SENT parts and explicit Web recovery

Full `npm run validate`, Supabase local migration/reset tests, `supabase db lint`, and hosted `db push --dry-run` must be run in the user's certified WSL environment after patch apply.
