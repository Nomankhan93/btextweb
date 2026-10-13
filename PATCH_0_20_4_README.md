# Patch 0.20.4 — Recipient Import Reliability & Scale

## Release contract

Frontend version: `0.20.4`
Backend send/delivery contract: `0.18.5`
Database migration: **yes** — `20261013000100_recipient_import_reliability_scale.sql`
Android release: **none**

## Problem corrected

The previous web release advertised and enforced `CSV · XLSX · max 5 MB / 5,000 rows`. CSV could work while XLSX decompression could fail on browser/WebView combinations, and large imports were forced through one fixed-size product ceiling and one giant staging payload.

## Implementation

- `.csv` and `.xlsx` remain the supported input formats.
- No source is rejected solely for being above 5 MB.
- No parsed recipient list is truncated or rejected solely for exceeding 5,000 rows.
- XLSX keeps native raw-DEFLATE where available and falls back to a bounded pure-JavaScript decoder.
- File read/hash/parse progress is surfaced to the UI and pre-staging/staging work can be cancelled.
- Database import creation is split into begin → append batches → finalize, with abort cleanup.
- Incomplete staging imports are hidden from import history.
- A database trigger prevents recipient preview creation from an unfinished staging import.
- Batch retry and finalize retry are idempotent.
- Duplicate-in-file status is finalized across all batches.
- Large downstream recipient RPC collection no longer defaults to a 5,000-row ceiling.

## Safety retained

The patch retains archive expansion safeguards and the 100-column mapping safeguard. These protect device/database resources and malformed inputs; they are not advertised campaign-size limits. Browser/IndexedDB memory and storage remain finite, so extremely large files can still fail with a recoverable device/resource error rather than being promised as unlimited.

No send, queue, SIM, callback, recovery, consent, or Android contract is changed.
