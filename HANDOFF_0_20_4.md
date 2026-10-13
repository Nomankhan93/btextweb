# Handoff — BulkText Web 0.20.4

Frontend: `0.20.4`
Backend send/delivery contract: `0.18.5`
Database migration: `20261013000100_recipient_import_reliability_scale.sql`
Android gateway: unchanged

## Delivered
- CSV/XLSX no longer use a 5 MB product cap.
- Parsed imports no longer truncate/reject at 5,000 recipients.
- XLSX gains a browser-independent bounded raw-DEFLATE fallback.
- Parse/staging work reports progress and can be cancelled.
- Large imports use begin/append/finalize/abort staging RPCs instead of one large JSON payload.
- Web batches are 250 rows; RPC batch maximum is 500 rows as a transport/safety boundary, not a campaign-size limit.
- Incomplete imports remain hidden and are rejected by recipient-preview creation.
- Finalization validates exact row count and recalculates duplicate flags over the full staged data set.
- Existing legacy `create_contact_import` remains compatible, with the historical file/row caps removed.
- Paged recipient retrieval and draft schema validation no longer impose a default 5,000-row maximum.

## Frozen contracts
Do not modify exact-SIM authorization, confirmation snapshot semantics, send preflight, durable queue, callback history, UNKNOWN recovery, consent/suppression, or Android gateway behavior as part of this release.

## Deployment order
1. Run `npm ci` and `npm run certify:0204`.
2. Apply `20261013000100_recipient_import_reliability_scale.sql` to local Supabase.
3. Run `npm run test:import-scale-local-0204`.
4. Run `git diff --check` and review the migration dry-run.
5. Push the migration to hosted Supabase.
6. Deploy the 0.20.4 frontend only after the new RPCs are available.
7. Smoke-test a normal CSV, an XLSX, and a >5,000-row import on desktop plus installed mobile PWA.
