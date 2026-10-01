# BulkText 0.12.0 Handoff

## Current state

Android 0.3 feasibility is validated on a physical device. Web/cloud is now at **0.12.0 — Message Composer & Personalization**.

## Authoritative workflow

```text
CSV/XLSX import
→ server phone normalization
→ recipient validation / duplicate resolution
→ immutable recipient preview
→ consent + suppression evaluation
→ immutable eligibility snapshot
→ editable message draft + personalization preview
→ SMS segment/package calculation (next)
→ immutable campaign confirmation
→ later preflight / queue / Android send
```

## 0.12 rules

- composer sources must be immutable eligibility snapshots with at least one `eligible` row;
- blocked eligibility rows never enter composer source data;
- drafts are editable working records, not campaign confirmation;
- Owner/Admin/Campaign Manager can create, update and delete drafts;
- organization members can read drafts and personalization previews;
- direct authenticated table writes remain blocked;
- built-in tokens: `{{name}}`, `{{first_name}}`, `{{last_name}}`, `{{phone}}`;
- custom fields use `{{custom:Field Name}}`;
- unsupported/malformed tokens are rejected server-side;
- missing per-recipient values are shown explicitly in preview rather than silently erased;
- 0.12 does not calculate SMS segments, queue work or send SMS.

## New schema

- `message_composer_drafts`

Forward migration:

`20261001000050_message_composer_personalization.sql`

## New route

- `/composer`

Stored eligibility snapshots link directly into the composer.

## Next roadmap phase

**0.13 — SMS Segment & Package Usage Calculator**

Do not skip the 0.12 migration or apply a later patch directly to an older source baseline.
