# BulkText — 0.10 Development Handoff

## Current baseline

- Android Gateway: 0.3 physical-device feasibility validated
- Web/Cloud: 0.10.0 Recipient Validation & Preview
- Current source path: `/home/noman/projects/bulktext-web-0.4.0` (folder name is historical)
- Supabase may be hosted for active development; always verify the linked project before pushing migrations

## 0.10 authoritative behavior

0.9 staged imports remain source evidence. 0.10 does not destructively deduplicate or edit those rows. A reviewer opens a staged import, chooses at most one row for each valid canonical E.164 number, may exclude valid recipients, and creates an immutable recipient preview revision.

Server RPCs re-normalize the phone values and enforce uniqueness independently of browser state. Snapshot rows retain source names/custom fields and explicit exclusion reasons.

An `included` 0.10 row is **not send-authorized**. Consent and suppression are deliberately absent and become the next phase.

## New migration

`20261001000030_recipient_validation_preview.sql`

Do not modify previously applied migrations.

## Next roadmap phase

**0.11 — Consent & Suppression**

Expected next gate: consent evidence/policy, organization suppression list, recipient suppression evaluation and authoritative exclusion before message composition/campaign confirmation.
