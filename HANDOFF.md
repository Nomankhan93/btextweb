# BulkText Web 0.16.3 Handoff

## Certified incoming baseline

```text
Web:                   0.16.2
Web commit:            331d56d on main
Cloud migration head:  20261001000320
Android:               0.17.0 / versionCode 9
```

## 0.16.3 purpose

**Simple Campaign Flow + Smart Number Import.** The product now follows the user's natural mental model:

```text
Create Campaign → Upload List → Write Message → Review / Send
```

Technical validation/compliance/safety details remain enforced and inspectable, but are not required as separate manual pages in the primary flow.

## New Web behavior

- `/campaigns/new` campaign-first wizard.
- Smart CSV/XLSX phone-column detection from both headers and actual values.
- Names are optional; phone numbers are the required field.
- XLSX parser tolerates leading title rows and large styled-empty tails.
- Automatic valid/invalid/duplicate summary and unique-recipient selection.
- One explicit bulk consent declaration for the prepared list.
- Suppression/do-not-send remains authoritative and always wins.
- Eligibility snapshot is created automatically after the declaration.
- Message composer is embedded in the simple flow.
- Existing immutable review/confirmation remains the final Web snapshot boundary.
- Confirmed campaign detail provides one `Send to Android` action that combines preflight + short authorization + durable queue creation.
- Android 0.17 still performs explicit phone-side execution; 0.16.3 does not add browser-to-SmsManager execution.

## New migration

```text
20261001000330_simple_campaign_flow_bulk_consent.sql
```

Adds:

```text
record_recipient_preview_bulk_consent(...)
```

The RPC creates append-only grant events only where active consent is not already present. It does not remove or bypass suppression. It updates schema metadata to `0.16.3` and enables the simple-flow/smart-import feature flags.

## Real workbook acceptance case

`HAMZA DATA.xlsx` contains one meaningful 1,400-row dataset even though its stored XLSX worksheet dimension extends much farther due formatting. 0.16.3 detects:

```text
phone column: Contact
name column:  name
rows:         1400
valid:        1400
invalid:      0
duplicates:   0
```

## Unchanged boundaries

- exact SIM binding and no-fallback rules;
- migrations through `20261001000320` are unchanged;
- campaign confirmation remains immutable;
- queue jobs and leases retain 00320 semantics;
- Android 0.17 `SUBMITTING` / `SUBMITTED` / `UNKNOWN` rules are unchanged;
- no cloud SENT/DELIVERED callback model is added here.

## Deployment order

```text
1. Apply Web 0.16.3 source/patch
2. nvm use / npm ci / npm run validate / npm audit / git diff --check
3. npx supabase migration list
4. npx supabase db push --dry-run
5. Confirm ONLY 20261001000330 is pending
6. npx supabase db push
7. Re-run migration list / schema verification
8. Browser acceptance using a controlled recipient list
9. Continue Android 0.17 real-device cloud execution acceptance
```

Do **not** start/rebase 0.18 until 0.17 real-device execution acceptance is complete.
