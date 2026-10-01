# BulkText Web 0.10.0 — Validation Results

## Patch scope

Recipient Validation & Preview on top of the 0.9 staged import foundation.

## Artifact validation performed while building the patch

- [x] existing migrations through `20261001000020_excel_csv_import.sql` retained unchanged
- [x] forward migration added as `20261001000030_recipient_validation_preview.sql`
- [x] package dependencies preserved; `@supabase/supabase-js` remains whatever compatible version is already installed
- [x] all 48 TypeScript/TSX source files passed TypeScript transpile syntax validation
- [x] `src/lib/recipientPreview.ts` passed strict standalone TypeScript checking
- [x] recipient selection/dedup helper smoke test passed
- [x] 0.10 preflight passed
- [x] every `scripts/test-*-local.mjs` file passed `node --check`
- [x] preview fixture covers duplicate choice, invalid row, manual exclusion, immutable revision and source-import delete protection
- [x] tenant-isolation and RPC-only write assertions included
- [x] installer compatibility check passed against the exact 0.9 baseline
- [x] installer apply test passed and preserved `@supabase/supabase-js ^2.117.2` in the analyzed baseline
- [x] regenerated `SHA256SUMS.txt` verified successfully after apply
- [x] payload excludes `.env`, Supabase runtime secrets, node_modules and build output

The build container could not complete a fresh dependency install within its network/time limit, so the full Vitest/Vite `npm run validate` suite remains an environment gate in the user's WSL project.

## Final environment gates

Run after applying the patch:

```bash
npm install
npm run validate
npm audit
```

For the isolated local Supabase stack:

```bash
npx supabase migration up --local
npm run validate:local
```

For hosted development, verify the linked project before `npx supabase db push`.

## Functional acceptance

- [ ] staged import opens `/imports/:importId/validate`
- [ ] default selection keeps one row per valid canonical number
- [ ] selecting a different duplicate deselects the previous row in that group
- [ ] invalid phone rows cannot be selected
- [ ] valid unique rows can be manually excluded
- [ ] server rejects duplicate canonical selections even if the browser is bypassed
- [ ] snapshot summary equals its complete row decision ledger
- [ ] subsequent review creates revision 2 instead of mutating revision 1
- [ ] source import cannot be deleted after recipient preview history exists
- [ ] Analyst can view but cannot create preview snapshots
- [ ] outside tenant cannot read preview data
- [ ] UI states clearly that consent/suppression is not yet applied
