# BulkText 0.16 — Durable Cloud Queue

0.16 is the durable Web → Android handoff. It does **not** send SMS.

## Safety boundary

```text
Confirmed immutable campaign
→ fresh 0.15 authorization
→ atomic authorization revalidation / consumption
→ one campaign dispatch
→ one immutable message job per campaign recipient
→ Android credential-authenticated lease
→ Android durable local persistence
→ cloud download ACK
→ STOP
```

`downloaded` means the Android client durably stored the job and ACKed that storage. It never means submitted to `SmsManager`, sent, or delivered.

## Server tables

- `campaign_dispatches` — one idempotent dispatch per campaign; freezes device and exact SIM execution identity.
- `campaign_message_jobs` — immutable phone/message/segment snapshot with only `queued`, `leased`, and `downloaded` states.
- `campaign_queue_events` — append-only queue lifecycle evidence.

## Queue creation

`enqueue_campaign_dispatch(...)` requires an authenticated workspace owner and a fresh, unrevoked, unconsumed 0.15 authorization. Inside the same transaction it locks the campaign/authorization, re-runs 0.15 preflight, rechecks exact device/SIM identity, creates jobs only from `campaign_recipients`, marks the authorization consumed, and writes audit evidence.

Database uniqueness on `campaign_dispatches.campaign_id` prevents accidental double enqueue. A retry after a lost browser response returns the already-created dispatch rather than creating another set of jobs.

## Android queue RPCs

Android continues to authenticate with the existing gateway `device_id + credential` contract.

- `claim_gateway_message_jobs(...)` — bounded to 25 jobs, 2-minute leases, one dispatch per batch, exact Web-bound SIM rechecked before job data is returned.
- `acknowledge_gateway_message_jobs(...)` — batch ACK after durable local persistence; idempotent for the same lease token/version.
- `release_gateway_message_job_leases(...)` — voluntarily returns unpersisted leased work to `queued`.
- Expired, un-ACKed leases are safely requeued before a later claim. `lease_version` prevents stale ACK/release calls from mutating a newer lease.

Another device cannot claim a dispatch because claim queries are scoped to the authenticated device ID and the dispatch's frozen `gateway_device_id`.

## Exact SIM rule

Every dispatch freezes:

- `gateway_device_id`
- `gateway_sim_id`
- `subscription_id`
- `slot_index`
- `sim_identity_hash`

Before claims, the current Web binding and current Android inventory must still match all of them. Missing/changed SIM means **blocked**, never fallback.

## Explicitly not in 0.16

- `SmsManager`
- SMS submission
- sent/delivery callbacks
- retry after possible submission
- scheduling
- pause/cancel execution semantics
- carrier package/balance authority

Android 0.6 is the next step and should implement durable local job storage + ACK against this stable cloud contract, still without sending SMS.
