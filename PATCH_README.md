# BulkText Web 0.10.0 Patch — Recipient Validation & Preview

Forward patch for the completed 0.9 Excel / CSV Import baseline.

## What it adds

- `/imports/:importId/validate` review workflow
- current server-side phone re-normalization for every staged row
- duplicate groups by canonical E.164
- one selected source row per canonical phone number
- explicit manual exclusion
- immutable recipient preview revisions and source-import delete protection once history exists
- full row-level snapshot with names and custom fields preserved
- tenant-scoped preview history/read APIs
- Owner/Admin/Campaign Manager snapshot creation; member read access
- direct authenticated preview-table writes blocked
- audit event `contacts.recipient_preview_created`
- regression/unit/local integration coverage
- migration `20261001000030_recipient_validation_preview.sql`

0.10 intentionally does **not** perform consent or suppression checks. An included row is not send-authorized.

## Apply

```bash
cd /home/noman/projects/bulktext-web-0.10.0-patch
./apply.sh --check /home/noman/projects/bulktext-web-0.4.0
./apply.sh /home/noman/projects/bulktext-web-0.4.0
```

The installer preserves dependency versions, writes backups outside the source tree, and does not execute database migrations.

## Validate source

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm install
npm run validate
npm audit
```

## Cloud Supabase

Verify the linked BulkText project first:

```bash
npx supabase projects list
npx supabase migration list
npx supabase db push
```

Do not run a cloud database reset.

## Local integration gate

With the isolated BulkText local stack on API port `56321`:

```bash
npx supabase migration up --local
npm run validate:local
```

Expected new marker:

```text
BulkText 0.10.0 RECIPIENT VALIDATION & PREVIEW LOCAL PASS
```
