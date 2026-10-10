# BulkText Web 0.18.5

Current patch: [Delivery & Recovery Contract Hardening](docs/DELIVERY_RECOVERY_CONTRACT_0185.md). Apply the 0.18.5 database migration before deploying this Web build. Legacy Android delivery reports remain unverified until the v2 consumer upgrade.

> **0.18.1 safety stabilization:** real-device acceptance proved that all-failed Android SENT callbacks can coexist with actual SMS delivery. Post-SmsManager callback failure is now UNKNOWN and callback-derived resend is disabled. See `docs/CALLBACK_RETRY_SAFETY_0181.md`.


Web 0.18 adds authoritative SMS attempt history, SENT/DELIVERED callback status, and explicit recovery controls on top of the certified 0.16.4 Simple Send UX.

## What changed

- Adds forward migration `20261001000340_delivery_attempts_callbacks_recovery.sql`.
- Stores immutable per-job attempt numbers and per-part SENT/DELIVERED callback outcomes.
- Campaign detail now shows Awaiting attempt, Submitted, Known sent, Delivered, Failed and UNKNOWN counts.
- Attempt history is visible per recipient.
- Explicit `safe_retry` is offered only when every SENT callback failed and zero parts reported SENT.
- UNKNOWN/mixed outcomes are never automatically retried; Web can only choose **continue without resending** for that recipient.
- Android callback/recovery RPCs require the paired gateway device credential even though they are reached through the public REST endpoint.

## Safety boundary

Web still owns immutable campaign confirmation, current eligibility re-check, short-lived send authorization and durable queue creation. Exact-SIM/no-fallback semantics from 00320 remain unchanged.

Android 0.18 must register a cloud attempt and persist local SUBMITTING before `SmsManager`. SENT and DELIVERED are separate facts. A delivery failure does not authorize resend. Callback timeout, mixed SENT results, conflicting callbacks, or an ambiguous post-submission boundary become UNKNOWN.

Safe retry is never automatic and requires an explicit Web request. A locally staged retry cannot execute until the recovery request has also been acknowledged by the cloud.

## Database

Migration head becomes `20261001000340_delivery_attempts_callbacks_recovery.sql`. Applied migrations through `20261001000330_simple_campaign_flow_bulk_consent.sql` must remain byte-for-byte unchanged.

### 0.18.2 campaign history cleanup
Campaign history now supports per-campaign deletion and bulk safe-history cleanup. Active/ambiguous Android work is retained by database-enforced deletion guards.


## 0.18.4 production safety + release hardening

- Production test-purge RPC/UI removed from the effective schema.
- Final recipient compliance is rechecked at Android attempt start.
- Release packaging/fresh-schema/checksum rules now derive from the current release contract.
- Historical migrations remain forward-only; UNKNOWN automatic resend and exact-SIM rules are unchanged.


## 0.18.3 test cleanup (historical)
0.18.3 introduced a development purge, but **0.18.4 removes its RPCs and UI/API exposure from the effective production schema** because cloud-only deletion is unsafe while Android can retain executable local jobs. The 0.18.3 migration remains unchanged in history.
