# BulkText Web 0.16.2

BulkText is an **individual-first SIM-powered SMS platform**. Web 0.16.2 is a release and verification stabilization build on top of the 0.16.1 recipient-completeness fix. It does not add SMS execution and does not change the durable queue or exact-SIM rules.

## Current flow

```text
CSV/XLSX upload
→ column mapping
→ number validation / duplicate handling
→ consent and suppression
→ message composer / personalization
→ SMS segment estimate
→ immutable campaign confirmation
→ gateway + exact-SIM preflight
→ short-lived send authorization
→ durable cloud queue
→ Android claim / durable local persist / ACK
→ STOP
```

`downloaded` means the Android client durably persisted and ACKed a cloud job. It does **not** mean submitted, sent, or delivered. Cloud-triggered SMS execution is intentionally out of scope.

## Certified database baseline

The migration chain is unchanged through:

```text
20261001000320_durable_cloud_queue.sql
```

No migration is added by 0.16.2. Database metadata therefore remains the 00320 schema version (`0.16.0`) while the Web package version is `0.16.2`. Never rewrite an already-applied migration.

Important current database capabilities:

- immutable campaign confirmation snapshot;
- gateway preflight and approximately 5-minute authorization;
- `campaign_dispatches`;
- `campaign_message_jobs`;
- `campaign_queue_events`;
- credential-authenticated claim / ACK / lease-release RPCs;
- exact Web-bound SIM enforcement;
- `queue_enabled=true`;
- `campaign_send_enabled=false`.

## 0.16.1 recipient completeness

0.16.1 fixed client retrieval that could treat one PostgREST page as the complete recipient dataset. Explicit paged retrieval now preserves the product limit of 5,000 import rows. The verified 1,400-row acceptance remained 1,400 source / 1,400 included.

## 0.16.2 stabilization

0.16.2 only:

- synchronizes release documentation and UI copy with the 00320 baseline;
- restores a placeholder-only `.env.example`;
- upgrades `supabase/verify_fresh_schema.sql` through 00320;
- adds deterministic release packaging and secret/path scanning;
- regenerates project-level checksums from a clean staged tree.

## Exact-SIM and retry invariants

- The Web-selected SIM is authoritative.
- Never silently fall back to another SIM.
- No cloud job is submitted to `SmsManager` in Web 0.16.2.
- Future uncertain post-submission states must fail closed as `UNKNOWN`, not blind-auto-retry.

## Development validation

```bash
nvm use || nvm install
npm ci
npm run validate
npm audit
git diff --check
```

Migration state:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

For this stabilization release, the expected result is **no new migration pending**.

## Release packaging

```bash
./scripts/release-package.sh
```

The release builder creates a clean staging directory, excludes local/runtime/generated material, writes and verifies `SHA256SUMS.txt`, scans for secret-bearing artifacts, then creates a deterministic ZIP and a separate ZIP SHA256 file.

Excluded examples include `.git/`, `node_modules/`, `dist/`, local `.env*` files except `.env.example`, `supabase/.temp/`, caches, patch backups, and generated release output.

## Next gate

Complete Android 0.6.1 ↔ Web 0.16.x real-device queue acceptance with 1–2 controlled recipients and **zero cloud SMS submission**. Only after that gate passes should a fresh Android 0.17 be built on 0.6.1. Old 0.17/0.18 patches must not be force-applied.
