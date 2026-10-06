# BulkText Web / Cloud 0.18.0 Patch

Apply only to a certified Web 0.16.4 tree whose migration head is `20261001000330_simple_campaign_flow_bulk_consent.sql`.

## Adds

- Forward migration `20261001000340_delivery_attempts_callbacks_recovery.sql`.
- SENT/DELIVERED campaign status.
- Immutable attempt history.
- Explicit all-failed-SENT safe retry.
- UNKNOWN recovery by continue-without-resend.
- Delivery/recovery tests and schema verification.

## Does not change

- Any applied migration through 00330.
- Campaign confirmation semantics.
- Consent/suppression rules.
- Durable queue 00320 semantics.
- Exact Web-selected SIM / no-fallback rule.

Cloud migration 00340 must be deployed before production Android 0.18 devices are allowed to execute campaigns.
