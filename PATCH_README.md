# Current Patch — Web 0.20.4

`0.20.4 — Recipient Import Reliability & Scale` makes `.xlsx` and `.csv` recipient ingestion reliable at larger sizes without changing message delivery semantics.

## Included
- removes the visible and enforced 5 MB source-file product cap;
- removes the enforced 5,000-row import/product cap;
- retains the 100-column mapping safeguard;
- adds progress and cancellation during file reading/parsing/staging;
- adds XLSX raw-DEFLATE fallback for browser/WebView compatibility;
- stages large imports in 250-row web batches through bounded server RPCs;
- makes repeated batch/finalize retries idempotent;
- hides incomplete imports and blocks previews from unfinished staging sessions;
- recomputes duplicate-in-file state across the entire finalized import;
- removes the default 5,000-row ceiling from paged recipient collection and local draft schema checks;
- retains 0.20.3-r1 production routing and controlled PWA update behavior.

## Not included
No change to campaign confirmation, send authorization, exact-SIM selection, queue semantics, delivery callbacks, UNKNOWN/recovery behavior, consent/suppression rules, subscription behavior, or Android gateway code.

## Database
This patch **does include** `supabase/migrations/20261013000100_recipient_import_reliability_scale.sql`. The migration must reach the target Supabase database before the 0.20.4 frontend is deployed.

## Validate
```bash
nvm use 24.21.0
npm ci
npm run certify:0204
npx supabase migration up --local
npm run test:import-scale-local-0204
git diff --check
```
