# BulkText 0.14.0 Validation Results

## Artifact-side checks completed

- patch payload construction: PASS
- 0.14 preflight file check: PASS in reconstructed Individual-First baseline
- changed TypeScript / TSX parse check: PASS
- campaign confirmation unit-test definitions included: PASS
- migration ordering review: PASS
- server-side personalization + SMS estimate review: PASS
- sending/queue metadata remains disabled: PASS

## Not independently completed in artifact environment

A complete `npm ci` could not finish in the artifact container, so authoritative Vitest / Vite execution remains the user's WSL environment.

The new PostgreSQL migration must also be validated against the linked Supabase project using `db push --dry-run`, actual migration application, and `db lint --linked`.

## Required acceptance

```bash
npm run validate
npm audit
npx supabase migration list
npx supabase db push --dry-run
```

Expected pending migration only:

```text
20261001000300_campaign_confirmation_snapshot.sql
```

After push:

```bash
npx supabase db lint --linked
```

Target: no schema errors.

## Browser acceptance

1. Save a complete message draft.
2. Ensure one Android phone is paired and a present SIM is selected.
3. Click `Review & confirm`.
4. Verify recipients, SMS estimate and phone/SIM summary.
5. Confirm the campaign.
6. Open the confirmed campaign detail.
7. Edit the original draft and verify the confirmed campaign snapshot does not change.
8. Confirm that there is still no send/schedule action.
