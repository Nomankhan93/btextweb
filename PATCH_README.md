# BulkText Web 0.12.0 — Message Composer & Personalization

This is a forward-only patch for a validated **0.11.0** source baseline.

## Adds

- eligibility-snapshot selector for message composition;
- editable organization-scoped message drafts;
- `bulktext-template-v1` personalization grammar;
- built-in variables: name, first name, last name and canonical phone;
- dynamic custom import-field variables;
- server-derived/stored template-variable list;
- server rejection of malformed or unsupported `{{...}}` tokens;
- full eligible-recipient personalization source RPC;
- live recipient rendering with explicit missing-value markers;
- composer draft history/load/update/delete UI;
- direct link from stored eligibility snapshot to composer;
- tenant/RBAC and RPC-only write protections;
- local Supabase regression/acceptance coverage.

## New migration

`supabase/migrations/20261001000050_message_composer_personalization.sql`

Existing migrations are immutable and must not be edited.

## Apply

```bash
./apply.sh --check /home/noman/projects/bulktext-web-0.4.0
./apply.sh /home/noman/projects/bulktext-web-0.4.0
```

The installer does not run database migrations.

## Validation

Local full gate:

```bash
npm run validate:local
```

Source/build gate for a hosted/cloud workflow:

```bash
npm run validate
npm audit
```

For Cloud Supabase, verify the linked project before `npx supabase db push`. Do not use `db reset` against the hosted project.

## Boundary

0.12 drafts text and previews personalization only. It does not calculate SMS encoding/segments, estimate package usage, create immutable campaign confirmation, schedule, queue or send SMS.

The next roadmap phase is **0.13 — SMS Segment & Package Usage Calculator**.
