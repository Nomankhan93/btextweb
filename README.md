# BulkText Web 0.13.0

BulkText is an **individual-first SIM-powered SMS platform**.

The web app prepares recipients, personalized messages and SMS usage estimates; a paired Android gateway will later send SMS through the user's explicitly selected SIM. SMS package eligibility and actual carrier charging are determined by the mobile operator.

## Current product scope

Built through 0.13:

- Supabase authentication and account recovery
- automatic hidden personal-workspace provisioning
- secure Android pairing foundation
- device dashboard and explicit SIM binding
- Pakistan mobile-number normalization
- CSV/XLSX import
- recipient validation and immutable preview snapshots
- consent / suppression evidence and eligibility snapshots
- message composer and personalization preview
- GSM-7 / Unicode SMS segment estimation
- recipient-specific and campaign-wide estimated SMS usage

Not built yet:

- immutable campaign confirmation
- gateway preflight
- durable cloud queue
- cloud-triggered Android sending
- scheduling
- campaign reports

## SMS model

```text
User account
→ paired Android phone
→ explicitly selected SIM
→ user's mobile-operator SMS package / balance
→ recipients
```

BulkText estimates SMS units from rendered message content. It does not claim authoritative carrier package balance or charges.

## Internal tenant architecture

The UI remains individual-first. The database still uses a hidden personal workspace (`organization_id`) internally so previously built device/import/recipient/compliance/composer data remains compatible and future Organizations support can be added without a destructive rewrite.

## Validation

Use the project Node version first:

```bash
nvm use || nvm install
npm install
npm run validate
npm audit
```

The active BulkText setup uses Supabase Cloud. Before pushing the 0.13 metadata migration:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

Expected pending migration:

```text
20261001000220_sms_segment_usage_calculator.sql
```

If the dry run contains only the expected pending migration, apply it:

```bash
npx supabase db push
npx supabase migration list
```

Do not run `supabase start` unless intentionally using a separate local test environment.

## Next planned feature

`0.14 — Campaign Confirmation Snapshot`
