# BulkText Web 0.16.4

Web 0.16.4 is the Simple Send UX companion for Android 0.17.1. It builds on the certified 0.16.3 Simple Campaign Flow + Smart Number Import without changing any Supabase migration.

## What changed

- Campaign Name input now uses the available form width and remains responsive.
- Message composer is wide, aligned and responsive with a larger writing area.
- Queued campaigns no longer show a misleading current preflight blocker as if it invalidates an already-created durable queue.
- Queue-time safety copy explains that Android still re-checks the exact frozen SIM before every irreversible submission.
- Android instructions now describe 0.17.1 foreground auto-sync and one-action bounded campaign send.

## Safety boundary

Web still owns confirmation, eligibility re-check, short-lived authorization and durable queue creation. Exact-SIM/no-fallback semantics are unchanged. Cloud SENT/DELIVERED callbacks, attempt history and safe retry remain 0.18 work.

## Database

No migration is added or modified. Migration head remains `20261001000330_simple_campaign_flow_bulk_consent.sql`.
