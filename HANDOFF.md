# BulkText Web 0.9.0 — Development Handoff

Current web/cloud version: **0.9.0 — Excel / CSV Import**.

## Completed foundation

- 0.4 Web & Cloud Foundation
- 0.5 Authentication, Organizations & RBAC
- 0.5.1 Organization & RBAC Stabilization
- 0.6 Secure Android Device Pairing
- 0.7 Device Dashboard & SIM Binding
- 0.8 Phone Number Foundation
- 0.9 Excel / CSV Import

## 0.9 delivered

The Imports workspace accepts CSV and modern XLSX files, parses them locally in the browser, maps phone/name columns, preserves unmapped custom fields, previews `pk-mobile-v1` normalization, and stages source rows per organization through backend RPCs.

Database staging re-runs phone normalization and calculates duplicate-in-file flags server-side. Invalid phone rows remain staged for the next validation phase instead of being silently dropped.

Owner/Admin/Campaign Manager can stage/delete imports. Analyst/Billing can view organization import history. RLS prevents cross-tenant reads and direct client writes are blocked.

## Deliberately not built yet

0.9 does not create final contacts, remove duplicates, apply suppression/consent, compose messages, create campaigns, queue SMS, or send through Android.

## Next roadmap phase

**0.10 — Recipient Validation & Preview**

Use staged import rows as the input. Add deterministic validation/dedup decisions and an explicit recipient preview before consent/suppression phases.
