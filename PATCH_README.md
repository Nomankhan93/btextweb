# BulkText Web 0.11.0 — Consent & Suppression

This is a forward-only patch for a validated **0.10.0** source baseline.

## Adds

- append-only consent evidence events;
- append-only suppression/lift events;
- current organization-scoped compliance status lookup;
- manager-only evidence history;
- suppression override over consent;
- optional consent expiry;
- immutable recipient eligibility snapshots;
- `/consent-suppression` management screen;
- `/recipient-previews/:previewId/eligibility` gate screen;
- recipient-preview links into the consent gate;
- local Supabase regression/acceptance coverage.

## New migration

`supabase/migrations/20261001000040_consent_suppression.sql`

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

0.11 records and freezes compliance eligibility. It does not compose messages, create/send campaigns or queue the Android gateway. The next roadmap phase is **0.12 — Message Composer & Personalization**.
