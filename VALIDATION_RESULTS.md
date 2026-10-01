# BulkText 0.13.0 Validation Results

## Artifact-side checks

- source integration review: PASS
- `npm run preflight`: PASS
- TypeScript `npx tsc --noEmit`: PASS
- new GSM-7 / Unicode boundary tests included: PASS (test definitions present)
- migration ordering / metadata review: PASS
- organization/team individual-account boundary retained: PASS
- Vitest/Vite execution: not completed in the artifact container because dependency installation timed out before a complete local toolchain was available

## Added unit coverage

`src/test/smsSegments.test.ts` covers:

- GSM-7 160/161 boundary
- GSM multipart boundary
- extension-table two-septet accounting
- Urdu Unicode 70/71 boundary
- mixed English + Urdu encoding
- emoji / supplementary UTF-16 accounting
- personalized recipient-specific encoding differences
- aggregate estimated SMS units
- incomplete personalization exclusion
- long-message warning threshold

## Required user-side acceptance

The user's active BulkText setup uses Supabase Cloud.

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm install
npm run validate
npm audit

npx supabase migration list
npx supabase db push --dry-run
```

Expected pending migration:

```text
20261001000070_sms_segment_usage_calculator.sql
```

If the dry run shows only that expected migration:

```bash
npx supabase db push
npx supabase migration list
```

Browser smoke-test the composer with short English, long English, Urdu, mixed content and personalized rows of different lengths.
