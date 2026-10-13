# Validation — BulkText Web 0.20.4

## Required gates

### Source / runtime
- `npm run test:import-scale-source-0204`
- `npm run test:import-scale-0204`
- `npm run certify:0204`
- `git diff --check`

### Database
After applying `20261013000100_recipient_import_reliability_scale.sql` to local Supabase:

- `npm run test:import-scale-local-0204`

The local DB test uses a source size above the former 5 MB ceiling and stages 5,201 rows in batches, checks idempotent retry/finalization, verifies unfinished staging is hidden, and verifies abort cleanup.

## Acceptance contract
- normal CSV import succeeds;
- normal XLSX import succeeds;
- >5 MB metadata is accepted by the database import contract;
- >5,000 rows are retained and staged rather than truncated;
- incomplete imports cannot create recipient previews;
- duplicate-in-file calculations are correct after all batches are present;
- cancellation performs best-effort staging cleanup;
- import history exposes only finalized imports;
- production routing / PWA update regressions from 0.20.3-r1 remain protected;
- campaign/send/SIM/queue/recovery behavior remains unchanged.

## Manual production smoke after deployment
- import a representative CSV;
- import a representative XLSX from desktop;
- import XLSX from the installed mobile PWA;
- exercise a >5,000-row file while observing progress;
- cancel one staging import and confirm it does not appear in history;
- complete one large import and confirm the expected row totals.
