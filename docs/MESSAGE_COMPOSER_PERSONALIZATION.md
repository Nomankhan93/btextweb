# BulkText 0.12 — Message Composer & Personalization

## Purpose

0.12 turns an immutable **recipient eligibility snapshot** into an editable message-composer workspace. It does **not** create an executable campaign and does not send SMS.

Authoritative flow after this patch:

```text
Import
→ recipient validation preview
→ consent & suppression eligibility snapshot
→ message draft + personalization preview (0.12)
→ SMS segment/package estimate (0.13)
→ immutable campaign confirmation (0.14)
→ later preflight / queue / Android execution
```

## Recipient source

The composer accepts only `recipient_eligibility_snapshots` belonging to the current organization with at least one row frozen as `eligible`.

Blocked rows are never exposed by `get_message_personalization_source_rows`.

The composer reads the immutable preview data behind each eligible row:

- display name
- first name
- last name
- canonical E.164 phone number
- custom import fields

A later change to consent/suppression does not mutate an already-created eligibility snapshot. A new gate revision should be created when compliance state must be refreshed.

## Template syntax

Syntax version: `bulktext-template-v1`.

Built-in tokens:

```text
{{name}}
{{first_name}}
{{last_name}}
{{phone}}
```

Custom import fields use:

```text
{{custom:City}}
{{custom:Customer ID}}
```

Custom field names are case-sensitive and come from the stored import/recipient preview.

The backend derives and stores `template_variables`; clients cannot supply an authoritative variable list.

Malformed or unsupported `{{...}}` tokens are rejected by `save_message_composer_draft`.

## Missing values

A syntactically valid token can still be missing for an individual recipient, for example when `{{custom:City}}` exists as a source column but one row is blank.

The frontend renders missing values explicitly as:

```text
⟦missing:custom:City⟧
```

0.12 does not silently substitute an empty string. This makes incomplete personalization visible before campaign confirmation.

## Persistence and permissions

`message_composer_drafts` are editable, organization-scoped working records.

- Owner: create/update/delete/read
- Admin: create/update/delete/read
- Campaign Manager: create/update/delete/read
- Analyst: read only
- Billing: read only as an organization member
- non-member: no access

Direct authenticated writes to the table are revoked. Mutations go through RPCs.

## Security boundary

0.12 keeps these capabilities disabled:

- SMS encoding / segment calculation
- SMS package usage estimate
- immutable campaign confirmation
- scheduling
- gateway preflight
- cloud queue creation
- Android sending sessions
- SMS sending

A saved composer draft is **not send authorization**.
