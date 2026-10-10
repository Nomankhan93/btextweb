# BulkText Web 0.18.4 — Production Safety + Release Hardening

0.18.4 is a forward-only safety/release patch. Historical migrations are not rewritten or deleted.

## Production safety

- The 0.18.3 development purge migration remains in migration history, but the effective 0.18.4 schema drops both purge RPCs.
- The Campaigns UI and Web API no longer expose the destructive test purge.
- `begin_gateway_message_attempt(...)` re-checks current recipient compliance immediately before server attempt creation/reuse.
- A recipient whose current compliance state is not `eligible` is rejected before Android persists `SUBMITTING` or invokes `SmsManager`.
- `UNKNOWN` automatic resend remains disabled and exact-SIM enforcement is unchanged.

## Release hardening

- `package.json` is the release-version source of truth.
- The release packager requires the latest migration to declare the same `app_meta` version.
- `supabase/.temp`, environment files, local DB/runtime state, build outputs, patch backups and release artifacts are excluded.
- The staged tree and final ZIP are scanned for forbidden paths and secret-like values.
- `SHA256SUMS.txt` is regenerated from the staged release tree and verified before ZIP creation.
- `supabase/verify_fresh_schema.sql` now verifies the effective 0.18.4 contract.

## Scope boundary

This patch intentionally does not implement device-revoke queue reconciliation, callback contract changes, import fixes, scheduling, or new product features. Those remain later patches in the accepted roadmap.
