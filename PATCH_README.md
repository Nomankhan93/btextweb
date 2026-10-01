# BulkText Web 0.7.0 Patch

Target baseline: **BulkText Web 0.6.0**.

Target project path used by the current development environment:

```text
/home/noman/projects/bulktext-web-0.4.0
```

The folder name may remain `0.4.0`; `package.json` is the version authority.

## Apply

```bash
./apply.sh --check /home/noman/projects/bulktext-web-0.4.0
./apply.sh /home/noman/projects/bulktext-web-0.4.0
```

The installer checks the expected 0.6.0 source baseline and puts overwritten-file backups outside the source tree.

## Migration

New forward migration only:

```text
20260930000230_device_dashboard_sim_binding.sql
```

Do not edit previous applied migrations and do not reset a database just to apply this patch.

## Validate locally

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm install
npx supabase start
npx supabase migration up --local
npm run validate:local
npm audit
```

If the working app now points at hosted Supabase, local acceptance can still be run in a disposable local environment; the test scripts intentionally reject non-local targets.
