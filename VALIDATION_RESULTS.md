# BulkText Web / Cloud 0.18.1 — Validation Results

Built from the supplied `bulktext-web-0.18-current.zip` 0.18.0 source snapshot.

## Implemented

- package/preflight version: 0.18.1
- forward migration: `20261006000180_callback_retry_safety_stabilization.sql`
- post-SmsManager all-failed SENT callbacks -> UNKNOWN
- callback-derived safe retry disabled at database RPC boundary
- existing callback-derived FAILED attempts reclassified to UNKNOWN
- pending legacy safe-retry recovery requests consumed
- Web Safe retry control removed
- schema verifier updated for 0.18.1 safety metadata

## Required local/hosted validation

Run in the target WSL project after applying this patch:

```bash
nvm use
npm ci
npm run validate
npm audit
git diff --check
npx supabase migration list
npx supabase db push --dry-run
```

Expected dry-run: only `20261006000180_callback_retry_safety_stabilization.sql`.

This build environment does not have the user's linked Supabase project or Android source/device, so hosted migration deployment and real-device acceptance remain certification gates.

## 0.18.2 pending local validation

Campaign/history delete patch added with DB safety guards, UI actions, and preflight coverage. Run `npm ci && npm run validate`, then verify the hosted migration dry-run before push.
