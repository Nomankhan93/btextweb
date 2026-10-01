# Recipient Validation & Preview — 0.10

BulkText 0.10 converts a staged 0.9 import into an explicit recipient preview revision. It does **not** authorize sending.

## Decision model

Every staged import row is re-normalized on the server with `pk-mobile-v1` when a preview is created. The preview stores one of four outcomes:

- **included** — a valid Pakistan mobile row explicitly selected for the preview
- **invalid_phone** — the phone fails the current server normalization rules
- **duplicate_in_file** — another selected row has the same canonical E.164 number
- **manually_excluded** — a valid canonical number has no selected row in this preview

Only one selected row is permitted for a canonical number. This lets the reviewer choose which duplicate source row carries the preferred name/custom fields without silently merging source data.

## Snapshot tables

- `recipient_previews` — immutable revision summary per staged import
- `recipient_preview_rows` — complete row-level snapshot and decision ledger

Each new review creates the next revision for the import. Existing revisions are not edited in place. Once preview history exists, the normal staged-import delete RPC refuses to delete that source import so the revision history cannot be silently removed.

## Permissions

Owner, Admin and Campaign Manager can create previews. All organization members can read preview history and rows. Direct authenticated writes to preview tables are blocked; creation is RPC-only.

## Explicit boundary

An **included** recipient means only “valid, unique and selected in this structural preview.” It does not mean:

- consent verified
- suppression/DNC cleared
- campaign confirmed
- gateway preflight passed
- SMS authorized or sent

Consent and suppression are the next roadmap gate in 0.11.
