# Current Handoff — Web 0.20.4

Current frontend release: `0.20.4`
Backend send/delivery contract: `0.18.5`
Database migration: `20261013000100_recipient_import_reliability_scale.sql`

`0.20.4 — Recipient Import Reliability & Scale` fixes XLSX compatibility and removes the historical 5 MB / 5,000-row import product caps. CSV/XLSX parsing now keeps the complete parsed row set, exposes progress/cancel state, and XLSX has a bounded JavaScript raw-DEFLATE fallback when native browser decompression is unavailable or fails.

Database staging is now bounded and retry-safe across row batches: `begin_contact_import`, `append_contact_import_rows`, `finalize_contact_import`, and `abort_contact_import`. Incomplete `staging` imports stay out of history and cannot create recipient previews. The legacy `create_contact_import` RPC remains as a compatibility wrapper without the retired product caps.

Campaign confirmation, send authorization, exact-SIM selection, durable queueing, callbacks, UNKNOWN recovery, consent/suppression behavior, and Android gateway behavior are unchanged.

Deployment order: validate locally, push the migration, then deploy the frontend. Primary web certification is `npm run certify:0204`; local DB acceptance is `npm run test:import-scale-local-0204` after the migration is applied to local Supabase.
