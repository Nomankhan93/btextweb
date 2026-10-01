# BulkText Web

Current source version: **0.10.0 — Recipient Validation & Preview**.

BulkText is a SIM-powered bulk SMS platform. The web/cloud application prepares campaigns and the Android gateway sends through the user's selected SIM/package.

## Current completed web/cloud phases

- 0.4 Web & Cloud Foundation
- 0.5 Authentication, Organizations & RBAC
- 0.6 Secure Android Device Pairing
- 0.7 Device Dashboard & SIM Binding
- 0.8 Phone Number Foundation
- 0.9 Excel / CSV Import
- 0.10 Recipient Validation & Preview

0.10 turns staged rows into explicit immutable preview revisions. It validates current phone normalization, lets reviewers choose one source row per canonical duplicate group, records manual exclusions and preserves row metadata. **Included does not mean consent/suppression-cleared or send-authorized.**

See `docs/RECIPIENT_VALIDATION_PREVIEW.md` and `PATCH_README.md`.
