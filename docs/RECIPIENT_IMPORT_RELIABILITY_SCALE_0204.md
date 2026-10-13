# Web 0.20.4 — Recipient Import Reliability & Scale

## Goal

Make modern Excel (`.xlsx`) and CSV recipient imports reliable in desktop browsers and installed PWAs, and remove the historical **5 MB / 5,000-row product caps** without weakening send, consent, SIM, queue, callback, or recovery contracts.

## Browser import contract

- `.csv` and `.xlsx` remain the supported source formats.
- `.xlsx` keeps native `DecompressionStream('deflate-raw')` when the browser supports it and now has a bounded pure-JavaScript DEFLATE fallback for browser/webview compatibility.
- CSV/XLSX parsing no longer slices at 5,000 rows and no longer rejects a file merely because it exceeds 5 MB.
- Import parsing reports read/hash/parse progress and can be cancelled before staging completes.
- The 100-column validation remains. It protects the mapping/custom-field contract and is not a recipient-count or file-size business limit.
- XLSX archive expansion guards remain as malformed/zip-bomb protections. They are not advertised product limits.

## Database staging contract

Large imports are no longer sent to PostgREST as one giant JSON array. Web 0.20.4 introduces:

1. `begin_contact_import(...)` — validates source metadata/mapping and creates a hidden `staging` session.
2. `append_contact_import_rows(...)` — appends at most 500 rows per server call; the web client uses 250-row batches.
3. `finalize_contact_import(...)` — verifies the exact final row count, recomputes deterministic duplicate flags across all batches, updates summary counts, and promotes the session to `staged`.
4. `abort_contact_import(...)` — deletes an incomplete staging session and its rows.

Batch retries are idempotent by `(import_id, source_row_number)`: a repeated identical row is accepted as an already-staged retry; conflicting content for the same source row is rejected.

`list_contact_imports(...)` exposes only finalized `staged` imports. A database trigger prevents recipient previews from being created from an incomplete `staging` import.

The legacy `create_contact_import(...)` RPC remains as a compatibility wrapper, but it no longer contains the historical 5 MB / 5,000-row checks.

## Client completeness

The old default 5,000-row ceiling in paged recipient RPC collection is removed. Callers can still opt into an explicit technical `maxRows` ceiling where a particular screen needs one.

Campaign-draft validation also no longer treats 5,000 rows as a schema maximum. Actual IndexedDB/browser quota failures remain recoverable device limitations rather than product recipient limits.

## Safety boundaries unchanged

This patch does **not** change:

- exact selected-SIM authorization;
- campaign confirmation immutability;
- consent/suppression enforcement;
- preflight send authorization;
- durable cloud queue semantics;
- callback or UNKNOWN recovery behavior;
- Android gateway behavior.

A staged import still authorizes no message send.

## Validation

Required automated gates:

- `npm run test:import-scale-source-0204`
- `npm run test:import-scale-0204`
- `npm run certify:0204`
- local Supabase migration followed by `npm run test:import-scale-local-0204`
- `git diff --check`

The local database test stages **5,201 rows**, uses source metadata above the former 5 MB cap, retries a batch and finalization idempotently, verifies incomplete imports stay hidden, and verifies cancel cleanup.
