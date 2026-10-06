# BulkText 0.18 — SENT/DELIVERED callbacks, attempts, safe recovery

0.18 extends the durable queue without weakening the exact-SIM boundary.

## Attempt boundary

Before Android calls `SmsManager`, it creates/reuses a local client attempt UUID and registers that attempt through `begin_gateway_message_attempt`. The server accepts a first attempt only for a durably downloaded job assigned to that exact gateway device. A retry attempt is accepted only after an explicit Web `safe_retry` recovery request has been applied by the device.

Every retry receives a new immutable attempt number. Previous attempts are never rewritten.

## Callback model

Android creates per-part `sent` and `delivery` PendingIntents. Callback events are first persisted to a local outbox and then reported idempotently to `report_gateway_message_attempt_event` with a unique event UUID.

Aggregate rules:

- all SENT parts successful → `sent`;
- all SENT parts failed and zero succeeded → `failed`, explicit safe retry eligible;
- mixed SENT success/failure → `unknown`, never automatically retried;
- all delivery parts successful after SENT → `delivered`;
- delivery failure does not make a message retryable because the carrier may already have sent it.

A callback timeout after `SmsManager` submission becomes `unknown`.

## Recovery

Web exposes two explicit recovery actions:

- `safe_retry`: only for attempts where every SENT callback failed and zero parts succeeded;
- `skip_unknown`: clears the Android safety pause without resending the UNKNOWN recipient.

UNKNOWN never becomes retryable in this release.

## Security

Android callback/recovery RPCs are callable with the anon REST key but require the rotating gateway device credential in the RPC body before any attempt data can be read or mutated. User-facing status/recovery RPCs require an authenticated personal-workspace member.
