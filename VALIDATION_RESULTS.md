# BulkText Web 0.16.2 Validation Results

## Release scope

Web 0.16.2 is **Release & Verification Stabilization only** on top of Web 0.16.1 / Cloud migration head `20261001000320`.

Explicitly unchanged:

- no SMS execution;
- no Android 0.17 work;
- no Web/Cloud 0.18 work;
- no durable queue semantic changes;
- no exact-SIM rule changes;
- no Supabase migration added or rewritten.

## Artifact-side checks completed

- `package.json` / `package-lock.json` version = `0.16.2`: **PASS**
- placeholder-only `.env.example` restored: **PASS**
- stale Campaigns / Recipient Eligibility queue-confirmation copy corrected: **PASS**
- `npm run preflight`: **PASS** (`BulkText 0.16.2 preflight PASS`)
- migration filename comparison vs uploaded 0.16.1 baseline: **16 / 16 identical**
- migration byte comparison vs uploaded 0.16.1 baseline: **16 / 16 identical**
- migration head in source: `20261001000320_durable_cloud_queue.sql`: **PASS**
- `supabase/verify_fresh_schema.sql` updated through 00320: **PASS (static review)**
- no-index `git diff --check` equivalent for uploaded ZIP baseline: **PASS (no whitespace errors)**
- deterministic clean staging release builder: **PASS**
- staged `SHA256SUMS.txt` generated without self-entry: **PASS**
- `sha256sum -c SHA256SUMS.txt` in staged release: **PASS**
- staged forbidden-path scan: **PASS**
- staged secret-value scan: **PASS**
- ZIP forbidden-path scan: **PASS**
- ZIP secret-value scan: **PASS**

The release scan recognizes that source code legitimately contains PostgreSQL role-name references such as `service_role` and local-test environment-variable identifiers such as `BULKTEXT_SUPABASE_SERVICE_ROLE_KEY`. These identifiers are not secret values. The scan rejects secret-like values/assignments and forbidden runtime files.

## Required release exclusions verified

The clean source ZIP excludes:

- `.git/`
- `node_modules/`
- `dist/`
- `.env`
- `.env.local`
- all `.env.*` except `.env.example`
- `supabase/.temp/`
- `supabase/.branches/`
- `supabase/config.toml.before-*`
- caches / Python bytecode / coverage / Vite/Turbo caches
- `.patch-backups/`
- generated release output
- `docker.env`

## Environment-dependent commands not independently completed here

The artifact container does not have the project-pinned Node `24.21.0`; it only has Node `22.16.0`. An attempt to install Node `24.21.0` through NVM could not resolve that remote version in this environment.

The container also has no DNS access to `registry.npmjs.org`. Therefore:

- `npm ci`: **BLOCKED by environment/network**
- `npm run validate` beyond the dependency-free preflight: **BLOCKED because dependencies cannot be installed**
- `npm audit`: **BLOCKED by registry/DNS access**

The uploaded 0.16.1 handoff records the preceding baseline as 73/73 tests PASS, production build PASS, and `npm audit` 0 vulnerabilities. Those baseline results are not being misrepresented as a fresh 0.16.2 execution.

## Supabase migration-state verification

Static source verification confirms:

- no migration was added;
- no migration was rewritten;
- source migration chain remains exactly aligned through `20261001000320`;
- Web 0.16.2 intentionally leaves DB `app_meta.schema.version` at `0.16.0`, because that value belongs to migration 00320.

A live `npx supabase migration list` / `npx supabase db push --dry-run` could not be independently completed in this artifact container because the Supabase CLI is not installed locally and NPM registry access is unavailable. The provided project handoff states the hosted migration head is already `20261001000320`; rerun the two CLI commands in the linked WSL project before deployment/push to reconfirm there is no pending migration.

## Required WSL confirmation commands

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

Expected database result: local migration files and hosted history align through `20261001000320`, with **no 0.16.2 migration pending**.

## Release result

Artifact/package stabilization checks: **PASS**.

Full Node 24 dependency/test/build/audit and live hosted migration-list confirmation: **requires execution in the user's networked WSL project**.
