# BulkText Web

Current version: **0.11.0 — Consent & Suppression**

BulkText is a SIM-powered bulk SMS platform. The web/cloud application prepares tenant-scoped recipients and future campaigns; an Android gateway sends through the user's selected SIM and operator package/balance.

## Current completed web/cloud phases

- 0.4 Web & Cloud Foundation
- 0.5 Authentication, Organizations & RBAC
- 0.5.1 Organization & RBAC Stabilization
- 0.6 Secure Android Device Pairing
- 0.7 Device Dashboard & SIM Binding
- 0.8 Phone Number Foundation
- 0.9 Excel / CSV Import
- 0.10 Recipient Validation & Preview
- **0.11 Consent & Suppression**

0.11 introduces append-only consent evidence, organization-scoped suppression events and immutable recipient eligibility snapshots. Active consent plus a clear suppression state is required for eligibility. No SMS is sent in this phase.

See `docs/CONSENT_SUPPRESSION.md` for the policy and RPC model.
