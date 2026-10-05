# Patch 0.16.3 — Simple Campaign Flow + Smart Number Import

Apply this patch only to the certified **Web 0.16.2** baseline (commit `331d56d` in the user's repository).

## Adds

- campaign-first `/campaigns/new` wizard;
- content-aware CSV/XLSX Pakistan mobile-number detection;
- robust meaningful-row/header detection for real-world XLSX files;
- one bulk consent declaration tied to a saved recipient preview;
- automatic eligibility snapshot creation;
- simplified message/review path;
- one Web `Send to Android` handoff action using existing preflight/authorization/queue RPCs;
- improved zero-eligible and retained-import UX;
- migration `20261001000330_simple_campaign_flow_bulk_consent.sql`.

## Does not change

- Android 0.17 source;
- exact-SIM/no-fallback rules;
- durable queue lease/download semantics;
- `SmsManager` execution semantics;
- SENT/DELIVERED callbacks or retry policy;
- any already-applied Supabase migration.

## Apply

```bash
./apply.sh /home/noman/projects/bulktext-web-0.4.0
```

The patch installer validates the 0.16.2 baseline and existing migration chain before copying files. It then regenerates the project-level checksum manifest.

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

The dry-run must show exactly **`20261001000330`** as the new pending migration. Review it before:

```bash
npx supabase db push
```
