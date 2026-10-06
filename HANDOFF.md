# BulkText 0.18.1 Web / Cloud Handoff

## 0.18.1 certification note

0.18.0 real-device acceptance exposed a duplicate-risk condition: SMS was physically received while SENT callbacks were classified as failed. 0.18.1 therefore converts callback-derived FAILED to UNKNOWN and disables callback-derived safe retry. Hosted migration and real-device re-certification are required before 0.19.


Baseline: certified Web 0.16.4, Android 0.17.2 background gateway, and cloud migration head 00330.

0.18 adds callback-aware delivery state without weakening the existing durable queue or exact-SIM boundary.

## New cloud contract

Forward migration: `20261001000340_delivery_attempts_callbacks_recovery.sql`.

New data:

- `campaign_message_attempts`
- `campaign_message_attempt_parts`
- `campaign_message_attempt_events`
- `campaign_message_recovery_requests`

New Android credential-authenticated RPCs:

- `begin_gateway_message_attempt`
- `report_gateway_message_attempt_event`
- `list_gateway_message_recovery_requests`
- `acknowledge_gateway_message_recovery`

New signed-in Web RPCs:

- `get_campaign_delivery_status`
- `list_campaign_message_attempts`
- `request_campaign_message_recovery`

## Recovery rules

- All SENT parts succeed -> SENT.
- All SENT parts fail with zero successful parts -> FAILED and eligible for an explicit safe retry.
- Mixed SENT results, callback conflict, callback timeout, or ambiguous post-SmsManager state -> UNKNOWN.
- UNKNOWN is never retryable in 0.18.
- `skip_unknown` means continue the gateway without resending that recipient.
- Delivery failure alone never creates retry eligibility.
- Every retry creates a new immutable attempt number; previous attempts are never rewritten.

## Deployment order

1. Apply/validate Web 0.18 locally.
2. Push migration 00340 to cloud.
3. Deploy Web 0.18.
4. Install Android 0.18 / versionCode 12.
5. Run a small real-device campaign and verify SENT/DELIVERED callbacks plus recovery behavior.

Do not install Android 0.18 against a cloud that does not yet expose migration 00340; Android intentionally blocks before `SmsManager` if attempt registration is unavailable.

## 0.18.2 campaign/history deletion
A forward migration adds safety-gated campaign deletion. Do not delete campaigns with active Android execution/recovery; the RPC enforces this server-side. `Delete safe history` skips blocked campaigns.
