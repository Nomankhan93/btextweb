# BulkText Web 0.20.10 — Handoff

## Scope

Campaign Delivery Experience only.

### Preserve

- 0.20.7 Confirm ≠ Send safety boundary;
- exact phone/SIM preflight and authorization;
- durable queue idempotency;
- 0.18.5 callback/recovery semantics;
- no automatic retry from post-SmsManager ambiguity;
- current adaptive-polling behavior.

### New UI contract

- top live status is derived from real queue + attempt counts;
- unresolved UNKNOWN never contributes to processed progress;
- `sent + delivered` is Known SENT, while DELIVERED is separate;
- full DELIVERED state requires `deliveredJobs === recipientCount`;
- resolved UNKNOWN is completed-with-unverified-result, not SENT/DELIVERED;
- UNKNOWN recovery is `skip_unknown` only and uses ActionDialog;
- attempt-history numbers remain masked.

No migration and no Android change.
