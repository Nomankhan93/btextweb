# BulkText Web 0.16.3

BulkText is an **individual-first SIM-powered SMS platform**. Web 0.16.3 makes the primary workflow campaign-first and adds smart phone-number import for real-world CSV/XLSX files while preserving the certified exact-SIM, immutable campaign, authorization and durable-queue safety boundaries.

## Primary user flow

```text
New Campaign
→ Campaign name
→ Upload CSV/XLSX
→ BulkText detects Pakistan mobile numbers
→ Confirm the prepared list has consent
→ Automatic consent/suppression eligibility
→ Write message
→ Review immutable campaign
→ Send to Android
```

Advanced recipient validation, consent history, gateway preflight, authorization and queue diagnostics remain available for audit/recovery, but they are no longer the normal path.

## Smart number import

0.16.3 treats the phone-number column as the required data and names/other columns as optional. It:

- accepts CSV and XLSX (up to 5 MB / 5,000 meaningful rows);
- detects common headers such as `phone`, `mobile`, `contact`, `cell`, `WhatsApp`, etc.;
- also scores the actual column values, so unfamiliar headers can still be detected;
- normalizes supported Pakistan mobile formats to `+923xxxxxxxxx`;
- identifies invalid and duplicate rows;
- auto-detects a display-name column when available;
- ignores styled-but-empty XLSX tail rows and searches the first meaningful rows for the real header.

The real `HAMZA DATA.xlsx` acceptance workbook resolves `Contact` as the phone column and `name` as the display-name column, with 1,400 meaningful rows.

## Bulk consent declaration

The simple flow replaces per-number `Manage` clicks with one explicit list-level declaration:

> I confirm these recipients have agreed to receive this campaign.

The server records append-only consent evidence against each included recipient in the saved preview. Existing active consent is not duplicated. **Do-not-send/suppression always overrides consent.** The declaration is an audit mechanism; users must only confirm it when they actually have permission to message the uploaded recipients.

## Send boundary

Web 0.16.3 does not call Android `SmsManager` directly. After immutable confirmation, **Send to Android** re-runs current safety checks, issues a short-lived authorization and creates the existing durable queue. Android 0.17 then explicitly claims/persists/ACKs and submits jobs using the exact Web-bound SIM.

Cloud SENT/DELIVERED callbacks, attempt/part history and safe retry remain future 0.18 work.

## Versions

```text
Web package:          0.16.3
Cloud migration head: 20261001000330
Android gateway:      0.17.0 / versionCode 9
Node:                 24.21.0 (project .nvmrc)
```

0.16.3 adds exactly one forward-only migration:

```text
20261001000330_simple_campaign_flow_bulk_consent.sql
```

Do not rewrite already-applied migrations.

## Validation

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm ci
npm run validate
npm audit
git diff --check

npx supabase migration list
npx supabase db push --dry-run
```

Before pushing the database, the dry-run must show **only `20261001000330` pending**. After review:

```bash
npx supabase db push
npx supabase migration list
```

Then run `supabase/verify_fresh_schema.sql` against a fresh/current schema as appropriate.

## Safety invariants preserved

- exact Web-bound SIM only;
- no automatic fallback to another SIM;
- suppression overrides consent;
- immutable campaign confirmation before queue creation;
- short-lived server authorization before durable queue creation;
- Android persists before external SMS effect;
- ambiguous post-`SmsManager` state is `UNKNOWN`;
- no blind automatic retry after possible submission;
- no service-role secrets in browser or Android clients.
