# BulkText Web 0.9.0 Patch — Excel / CSV Import

This is a forward patch for the completed 0.8 Phone Number Foundation baseline.

## What it adds

- CSV parser with delimiter detection and quoted-field support
- modern XLSX first-sheet parser without third-party upload/parsing services
- automatic/common column mapping with explicit phone mapping
- import preview using `pk-mobile-v1`
- custom-field preservation
- tenant-scoped `contact_imports` / `contact_import_rows`
- server-authoritative phone normalization during staging
- duplicate-in-file flagging without removal
- import history and staged-import deletion
- Owner/Admin/Campaign Manager write permissions; member read permissions
- RLS/RPC regression coverage
- migration `20261001000020_excel_csv_import.sql`

## Apply

```bash
cd /home/noman/projects/bulktext-web-0.9.0-patch
./apply.sh --check /home/noman/projects/bulktext-web-0.4.0
./apply.sh /home/noman/projects/bulktext-web-0.4.0
```

The installer does not run database migrations and writes backups outside the source tree.

## Validate source

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm install
npm run validate
npm audit
```

## Cloud Supabase

Verify the linked BulkText project before pushing:

```bash
npx supabase projects list
npx supabase migration list
npx supabase db push
```

Do not run a cloud database reset.

## Local integration gate

When using the isolated BulkText local stack (`56321` API) apply migrations and run:

```bash
npx supabase migration up --local
npm run validate:local
```

Expected new marker:

```text
BulkText 0.9.0 EXCEL / CSV IMPORT LOCAL PASS
```
