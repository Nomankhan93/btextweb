# Patch 0.16.2 — Release & Verification Stabilization

## Purpose

Stabilize the already-built Web 0.16.1 / Cloud 00320 baseline without changing database or queue behavior.

## Changes

- bump Web package to 0.16.2;
- refresh stale release documentation;
- correct stale UI copy about campaign confirmation and cloud queue availability;
- verify fresh schema through migration 00320;
- add safe placeholder-only `.env.example`;
- add deterministic release staging / checksum / ZIP scripts;
- exclude local/runtime/generated files and secrets from release artifacts;
- regenerate project-level `SHA256SUMS.txt`.

## Explicitly unchanged

- no SMS execution;
- no Android 0.17 work;
- no 0.18 work;
- no queue-state or lease-semantic changes;
- no exact-SIM rule changes;
- no new or rewritten Supabase migration.

## Apply patch

From the extracted patch directory:

```bash
./apply.sh /home/noman/projects/bulktext-web-0.4.0
```

The patch accepts only a target whose `package.json` version is `0.16.1` (or is already `0.16.2` for an idempotent re-apply).

## Validate

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm ci
npm run validate
npm audit
git diff --check
npx supabase migration list
npx supabase db push --dry-run
```

Expected database result: migration chain aligned through `20261001000320` and **no new migration from 0.16.2**.

## Package

```bash
./scripts/release-package.sh
```

This creates a clean staged tree, verifies `SHA256SUMS.txt` with `sha256sum -c`, performs release safety scans, creates a deterministic ZIP, and writes a separate final ZIP SHA256.
