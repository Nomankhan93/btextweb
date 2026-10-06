# BulkText Web / Cloud 0.18.1 Patch

Safety stabilization after real-device 0.18 acceptance exposed callback-derived duplicate risk.

## Changes

- Adds forward migration `20261006000180_callback_retry_safety_stabilization.sql`.
- Reclassifies all 00340 callback-derived `FAILED` attempts to `UNKNOWN`.
- Disables callback-derived `safe_retry` server-side, including for old Web clients.
- Consumes pending legacy safe-retry requests.
- Keeps late complete SENT callbacks capable of resolving UNKNOWN to SENT/DELIVERED.
- Removes Safe retry action/badge from Campaign detail UX.
- Separates PREPARED/SUBMITTED wording from carrier SENT.
- Adds preflight markers and 0.18.1 schema metadata verification.

## Safety rule

After `SmsManager` invocation, callback failure is ambiguous. Do not resend. UNKNOWN may only be continued without resending.

## Deploy order

1. Validate locally.
2. Confirm `supabase db push --dry-run` shows only `20261006000180_callback_retry_safety_stabilization.sql`.
3. Push migration.
4. Revalidate.
5. Re-run controlled real-device acceptance without pressing any legacy Safe retry path.

## 0.18.2 — Safe campaign/history delete

- Per-campaign Delete action on Campaign history and Campaign detail.
- `Delete safe history` bulk cleanup.
- Database-enforced guards prevent deletion while Android execution, callbacks, UNKNOWN recovery, leases, or unsafe downloaded jobs are still active.
- Never-downloaded queued jobs may be cancelled by an intentional delete.
