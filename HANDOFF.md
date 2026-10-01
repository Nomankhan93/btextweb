# BulkText 0.11.0 Handoff

## Current state

Android 0.3 feasibility is validated on a physical device. Web/cloud is now at **0.11.0 — Consent & Suppression**.

## Authoritative recipient flow

```text
CSV/XLSX import
→ server phone normalization
→ recipient validation / duplicate resolution
→ immutable recipient preview
→ consent + suppression evaluation
→ immutable eligibility snapshot
→ message composer (next)
→ later confirmation / preflight / queue / Android send
```

## 0.11 rules

- no consent is assumed;
- latest active consent grant is required;
- expired or revoked consent blocks eligibility;
- active suppression overrides consent;
- Owner/Admin/Campaign Manager can record consent and suppress numbers;
- only Owner/Admin can lift suppression;
- consent and suppression evidence is append-only;
- eligibility snapshots are immutable revisions;
- 0.11 does not send SMS.

## New schema

- `contact_consent_events`
- `contact_suppression_events`
- `recipient_eligibility_snapshots`
- `recipient_eligibility_rows`

Forward migration:

`20261001000040_consent_suppression.sql`

## New routes

- `/consent-suppression`
- `/recipient-previews/:previewId/eligibility`

## Next roadmap phase

**0.12 — Message Composer & Personalization**

Do not skip the 0.11 migration or apply 0.12 directly to an older source baseline.
