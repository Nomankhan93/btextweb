# BulkText — Fresh Supabase Individual-First Baseline (through 0.13)

This package rebuilds the current BulkText database for a **new / empty Supabase Cloud project** using the revised Individual-First architecture.

## Product tenancy

User-facing model:

```text
User
→ My Phone
→ My Selected SIM
→ Imports / Recipients / Composer
```

Internal data boundary:

```text
Auth User
→ Hidden Personal Workspace
→ organization_id
```

`organizations` and `organization_members` are intentionally retained internally. Organization/team/invitation UX and authenticated multi-workspace APIs are not created.

## Migration order

1. `20261001000100_individual_account_foundation.sql`
2. `20261001000110_secure_android_device_pairing.sql`
3. `20261001000120_device_dashboard_sim_binding.sql`
4. `20261001000130_phone_number_foundation.sql`
5. `20261001000140_excel_csv_import.sql`
6. `20261001000150_recipient_validation_preview.sql`
7. `20261001000160_consent_suppression.sql`
8. `20261001000170_message_composer_personalization.sql`
9. `20261001000180_sms_segment_usage_calculator.sql`

## Important changes from the historical chain

- 0.4 + 0.5 + 0.5.1 + the structural Individual transition are collapsed into migration `00100`.
- No `organization_invitations` table is created.
- No authenticated organization creation/switching/team-management RPC is created.
- `is_org_member`, `org_role`, and `can_manage_org` are constrained to the authenticated user's `profiles.personal_workspace_id`.
- Signup automatically provisions one hidden personal workspace and internal Owner membership.
- Individual MVP enforces **one active Android gateway phone per personal workspace**.
- Dual-SIM inventory remains supported.
- A SIM must be explicitly bound; there is **no silent SIM fallback**.
- Import/preview/compliance/composer schemas keep `organization_id` internally for tenant isolation and future post-1.0 extensibility.
- Metadata updates merge into `app_meta` instead of repeatedly erasing Individual-First capability fields.

## Before replacing the repository migration folder

Back up the historical files outside the repo:

```bash
cd /home/noman/projects/bulktext-web-0.4.0

mkdir -p /home/noman/projects/.bulktext-old-migrations
cp -a supabase/migrations/. /home/noman/projects/.bulktext-old-migrations/
```

Also back up the current environment file before pointing the app at a new cloud project:

```bash
cp .env.local /home/noman/projects/.bulktext-env-before-fresh-supabase
```

## Repository compatibility note

The current `scripts/preflight.mjs` hard-codes the **historical migration filenames**. Therefore simply replacing `supabase/migrations/*.sql` with this clean chain will make the current preflight filename check fail until that script is updated.

Likewise several historical `test:*:local` scripts still create organization/RBAC fixtures. They must be converted to personal-workspace fixtures before `npm run validate:local` is treated as authoritative for this clean baseline.

`npm run check`, `npm run test`, and `npm run build` are separate from this migration-filename issue. A follow-up repository patch should update preflight + local DB acceptance fixtures when these migrations are installed.

## New Supabase Cloud project workflow

Create a new empty Supabase project, then link the repo to it:

```bash
cd /home/noman/projects/bulktext-web-0.4.0

npx supabase unlink
npx supabase link --project-ref NEW_PROJECT_REF
```

After the repository migration folder has been switched to this clean chain:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

For a truly fresh project, the dry-run should show this new migration chain as pending. Inspect it before applying anything.

Then:

```bash
npx supabase db push
npx supabase migration list
```

Finally run `verify_fresh_schema.sql` in the Supabase SQL Editor (or through an appropriate SQL workflow) to confirm the structural baseline.

## Environment

Update `.env.local` with the **new project's** Supabase URL/key. Do not copy localhost values into the cloud configuration.

## Do not do this

- Do not apply the old and new migration chains together.
- Do not reintroduce organization/team/invitation UX for the Individual MVP.
- Do not remove the hidden `organization_id` tenant boundary.
- Do not allow more than one active gateway phone in the Individual MVP.
- Do not silently switch SIMs.
- Do not treat estimated SMS units as authoritative carrier balance/deduction.
- Do not build campaign sending tables in this baseline; 0.14 confirmation comes next after the fresh foundation is validated.

## Historical local development note

Earlier BulkText development used a dedicated local Supabase port range:

```text
API        56321
DB         56322
Studio     56323
Mailpit    56324
Shadow DB  56320
The current Individual-First baseline is intended for the linked Supabase Cloud
development project. Do not assume a local BulkText database is running unless
a local environment is explicitly created again.
