# BulkText 0.9 — Excel / CSV Import

## Purpose

0.9 introduces tenant-scoped **source-file staging**. It does not create final contacts, campaign recipients, consent records, suppression decisions, or SMS jobs.

## Accepted files

- `.csv`
- `.xlsx` (modern Office Open XML workbook)
- Maximum file size: 5 MB
- Maximum staged data rows: 5,000
- Maximum columns: 100
- The first non-empty row is treated as the header row.
- XLSX imports read the first worksheet only in this phase.
- Legacy `.xls` is rejected; save it as `.xlsx` or CSV.

## Browser parsing

CSV parsing supports quoted fields, escaped quotes, embedded newlines, comma/semicolon/tab delimiter detection, duplicate-header disambiguation, and UTF-8 BOM removal.

XLSX parsing is implemented without an external online service. The browser reads the workbook ZIP structure, first worksheet, shared strings, inline strings, text/numeric/boolean cell values, and preserves values as import text. No spreadsheet is uploaded to a third-party parser.

## Mapping

The import page auto-detects common headings for:

- phone / mobile number (required)
- full/display name
- first name
- last name

All other non-empty columns are preserved in `custom_fields`.

## Phone normalization

Browser preview uses the 0.8 `pk-mobile-v1` rules. The database does **not** trust the browser result: `create_contact_import` calls `normalize_phone_number` again for every staged row.

Valid duplicates are retained and marked `duplicate_in_file=true`. They are not removed in 0.9. Formal recipient deduplication belongs to 0.10.

## Authorization

- Owner: view / stage / delete
- Admin: view / stage / delete
- Campaign Manager: view / stage / delete
- Analyst: view only
- Billing: view only
- Non-members: no tenant access

Tables are read-only to authenticated clients under RLS. Staging/deletion is performed through security-definer RPCs with current-user role checks.

## Tables

- `contact_imports`
- `contact_import_rows`

## RPCs

- `can_stage_contact_imports(organization_id)`
- `create_contact_import(...)`
- `list_contact_imports(organization_id)`
- `delete_contact_import(organization_id, import_id)`

## Sending boundary

A staged row is not a recipient authorization. 0.9 does not send messages and does not bypass later consent, suppression, confirmation, preflight, queue, or Android gateway controls.
