# Web 0.18.5 — Delivery & Recovery Contract Hardening

Current version 0.18.5; baseline 0.18.4. See docs/DELIVERY_RECOVERY_CONTRACT_0185.md for exact RPCs and transition rules, and VALIDATION_RESULTS.md for validation limits.

After applying the source patch:

```bash
npm ci
npm run validate
npm run test:delivery-contract
supabase migration list --linked
supabase db push --linked --dry-run
```

This project uses hosted Supabase. No `supabase start`, local migration or reset is required. The SQL contract test uses an isolated in-memory database only.

Verify the linked project and migration history. If the dry run lists only `20261010000100_delivery_recovery_contract_hardening.sql`, apply with `supabase db push --linked`. If other pending migrations or a different project appear, stop and review those first. Do not reset the database, edit old migrations or force migration-history repairs.

Apply the database migration BEFORE deploying this Web build. Then execute supabase/verify_fresh_schema.sql in the hosted SQL editor for read-only metadata/grant checks.

Keep Android 0.18.4 installed until the next consumer patch. SENT reporting remains supported. Legacy delivery callbacks are now unverified; historical unsupported DELIVERED claims become SENT without enabling resend. Phone-side recovery/outbox/blocked-job behavior requires Android 0.18.5.

Migration rollback is forward-fix only: do not drop conflict/tombstone/recovery data or restore unsafe result-code-only delivery aggregation. If the Web deployment fails, the old Web can operate against retained v1 RPCs while the Web issue is fixed.
