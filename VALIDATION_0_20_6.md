# Validation — BulkText Web 0.20.6

## Completed in artifact build environment

- `node scripts/preflight.mjs` — **PASS** (`BulkText Web 0.20.6 / backend 0.18.5 preflight PASS`).
- `node scripts/test-dashboard-control-center0206-source.mjs` — **PASS** (20 assertions).
- All 23 package source-contract scripts (`test:*source*`) — **PASS**.
- `src/styles/app.css` parsed with PostCSS — **PASS**.
- TypeScript syntactic transpilation of `DashboardPage.tsx` and `dashboardControlCenter0206.test.tsx` using the available global TypeScript compiler — **PASS**.
- Release source inspection confirms no 0.20.6 Supabase migration was added and backend contract remains `0.18.5`.
- Patch installer applied successfully to a fresh extraction of the supplied `0.20.5-r1` baseline; dependency-free 0.20.6 source/preflight gates passed after apply.
- Patch idempotency check — **PASS**; a second apply reported `0.20.6 is already applied`.
- Applied payload byte comparison against the built tree — **PASS** (44 files).
- Clean-source release packager path/secret/manifest/extracted-preflight gates — **PASS**.

## Environment limitation

The artifact environment could not install project dependencies because npm registry DNS access failed with `EAI_AGAIN`. The uploaded clean analysis ZIP does not contain `node_modules`, so Vitest, project semantic type-checking, and the Vite production build cannot be executed here without registry access.

Run in the normal WSL project environment:

```bash
npm ci
npm run certify:0206
git diff --check
```

`certify:0206` runs:

1. the 0.20.6 dashboard source contract;
2. project preflight;
3. TypeScript project check;
4. focused Dashboard/PWA/mobile-navigation regressions;
5. the full Vitest suite;
6. the production build.

## Deployment verification

After frontend deployment and controlled PWA update, verify on desktop and mobile browser:

- exactly one Home `New campaign` CTA;
- gateway health/phone/SIM/recipient values in Sending setup;
- compact recipients and draft modules;
- recent campaign rows and links;
- no dashboard-specific PWA install card;
- partial-failure warning without hiding successful sibling modules.
