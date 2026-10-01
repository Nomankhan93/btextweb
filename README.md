# BulkText Web

Current version: **0.12.0 — Message Composer & Personalization**

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
- 0.11 Consent & Suppression
- **0.12 Message Composer & Personalization**

0.12 introduces editable message drafts sourced only from immutable eligibility snapshots. It supports built-in and imported custom personalization fields, server-validated token grammar, recipient-specific live rendering and explicit missing-value review.

A 0.12 draft is not an executable campaign. SMS segment calculation, immutable campaign confirmation, scheduling, queueing and Android sending remain disabled.

See `docs/MESSAGE_COMPOSER_PERSONALIZATION.md` for the template syntax and trust boundary.
