# Validation — BulkText Web 0.20.8

## Completed in artifact build environment

- `node scripts/test-campaign-wizard-simplification0208-source.mjs` — **PASS** (42 assertions).
- `node scripts/test-campaign-confirmation-send-safety0207-source.mjs` — **PASS** (32 assertions), confirming 0.20.7 send safety remains present.
- `node scripts/preflight.mjs` — **PASS** (`BulkText Web 0.20.8 / backend 0.18.5 preflight PASS`).
- All **25** package source-contract scripts (`scripts/test-*-source.mjs`) — **PASS**.
- TypeScript/TSX syntactic transpilation of the touched campaign pages, AppShell, and touched/new campaign tests using the available global TypeScript compiler — **PASS**.
- CSS structural parsing/balance checks — **PASS**.
- Source inspection confirms no 0.20.8 Supabase migration was added and backend contract remains `0.18.5`.

## Environment limitation

The clean source does not include `node_modules`. `npm ci --offline --ignore-scripts` could not complete because the local npm cache is missing `yallist-3.1.1.tgz` (`ENOTCACHED`). Therefore Vitest, project semantic type-checking and the Vite production build must be run in the normal WSL project environment with dependencies available.

Run:

```bash
npm ci
npm run certify:0208
git diff --check
```

`certify:0208` runs:

1. 0.20.8 campaign-wizard source contract;
2. retained 0.20.7 confirmation/send-safety source contract;
3. project preflight;
4. TypeScript project check;
5. focused wizard/campaign/offline/mobile regressions;
6. retained final-send safety regressions;
7. full Vitest suite;
8. production build.

## Deployment verification

After deployment and controlled PWA update, verify on mobile and desktop browsers:

- blank campaign opens only Step 1;
- Continue moves to Step 2 without keeping the Step 1 form on screen;
- successful recipient preparation moves to Message;
- Back from Message returns to prepared Recipients without repeating import writes;
- changing recipient list resets preparation and requires consent again;
- Advanced mapping stays collapsed on confident detection and opens for uncertain mapping;
- consent reference stays collapsed until requested;
- focused mobile shell has no global bottom navigation during create/review;
- loading/error review states still expose mobile Message/Exit navigation;
- campaign confirmation still says nothing is sent yet;
- confirmed-campaign send behavior from 0.20.7 remains unchanged.

## Release boundary

Frontend `0.20.8`; backend contract `0.18.5`; no new SQL migration; no Android change.
