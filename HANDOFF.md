# BulkText Web 0.16.2 Handoff

## Baseline

```text
Web package:             0.16.2
Built from Web baseline: 0.16.1 / commit 5310827
Cloud migration head:    20261001000320
Android baseline:        0.6.1 / versionCode 8
Recipient 1400→1000 bug: fixed in 0.16.1
```

0.16.2 is **stabilization only**. No Supabase migration was added or rewritten. No SMS execution was added. Durable queue semantics and exact-SIM behavior are unchanged.

## Current architecture boundary

```text
confirmed campaign
→ gateway/exact-SIM preflight
→ short-lived authorization
→ durable cloud queue
→ Android claim
→ durable local persistence
→ ACK
→ STOP
```

Queue state `downloaded` is not SMS submission, sent, or delivered. `campaign_send_enabled=false`.

## Non-negotiable rules

- exact Web-bound SIM only;
- no silent SIM fallback;
- suppression overrides consent;
- browser pagination must not define campaign completeness;
- persist before future external SMS effect;
- no blind retry after possible future `SmsManager` submission;
- ambiguous future submission state is `UNKNOWN`;
- never rewrite applied Supabase migrations.

## Database state

Current forward migration chain ends at:

```text
20261001000300_campaign_confirmation_snapshot.sql
20261001000305_campaign_confirmation_lint_stabilization.sql
20261001000310_gateway_preflight_send_authorization.sql
20261001000320_durable_cloud_queue.sql
```

Because 0.16.2 has no DB migration, `app_meta.schema.version` remains `0.16.0` from 00320. The fresh-schema verifier checks the 00320 objects and feature flags.

## 0.16.2 changes

- Web version bumped to 0.16.2.
- README / handoff / patch / validation documentation refreshed.
- Stale Campaigns and Recipient Eligibility copy corrected: confirmation and durable queue are present; SMS execution remains disabled.
- `.env.example` restored with public placeholder values only.
- `supabase/verify_fresh_schema.sql` updated through 00320.
- deterministic clean-stage release packaging added.
- project-level `SHA256SUMS.txt` regenerated from the clean release stage.
- release scan rejects local env/runtime files and secret-value patterns.

## Remaining QA gate before 0.17

Use only 1–2 controlled/authorized recipients:

1. create a tiny confirmed campaign;
2. preflight Ready;
3. authorize;
4. create durable queue;
5. Android 0.6.1 Sync cloud jobs (no SMS);
6. verify claim → local persistence → ACK;
7. verify Web queue becomes `downloaded`;
8. force-stop/reopen and verify persistence;
9. offline → restore → safe resync;
10. remove/disable bound SIM and verify Missing/block;
11. verify other SIM is never substituted;
12. duplicate sync does not duplicate local jobs;
13. cloud-triggered SMS count remains zero.

## Next build order

```text
0.16.2 stabilization
→ finish Android 0.6.1 real-device queue QA
→ build NEW Android 0.17 on 0.6.1
→ controlled SMS execution acceptance
→ build NEW Web/Cloud 0.18 on 0.16.2/current baseline
```

Do not force-apply old Android 0.17 or old Web 0.18 artifacts.
