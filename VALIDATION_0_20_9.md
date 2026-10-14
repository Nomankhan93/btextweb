# Validation — BulkText Web 0.20.9

## Completed in artifact build environment

- `node scripts/test-campaign-message-review0209-source.mjs` — **PASS (43 assertions)**.
- retained 0.20.8 campaign-wizard source contract — **PASS**.
- retained 0.20.7 confirmation/send-safety source contract — **PASS**.
- all **26** package source-contract scripts (`scripts/test-*-source.mjs`) — **PASS**.
- `node scripts/preflight.mjs` — **PASS** (`BulkText Web 0.20.9 / backend 0.18.5 preflight PASS`).
- TypeScript/TSX syntactic transpilation for touched/new source and test files using the available global TypeScript compiler — **PASS**.
- CSS parsing via `tinycss2` — **PASS (0 parse errors)**.
- clean source release path/secret/manifest verification — **PASS**.
- extracted clean-source ZIP preflight — **PASS**.
- guarded 0.20.8→0.20.9 patch apply — **PASS**.
- automatic backup — **PASS (44 replaced baseline files)**.
- patch idempotent second apply — **PASS**.
- patched release byte comparison — **PASS (53/53 release files)**.

## Dependency-environment limitation

The clean artifact intentionally has no `node_modules`. `npm ci --offline --ignore-scripts` could not complete because the local npm cache is missing `yallist-3.1.1.tgz` (`ENOTCACHED`). Therefore Vitest, semantic project type-checking and the Vite production build must be run in the normal WSL project environment with dependencies available.

Run:

```bash
npm ci
npm run certify:0209
git diff --check
```

`certify:0209` runs:

1. 0.20.9 Message & Review source contract;
2. retained 0.20.8 wizard source contract;
3. retained 0.20.7 confirmation/send-safety source contract;
4. project preflight;
5. TypeScript project check;
6. focused 0.20.9 campaign/review regressions;
7. retained final-send safety regressions;
8. full Vitest suite;
9. production build.

## Deployment verification

Verify desktop and mobile browsers:

- composer shows live characters/encoding/segments/estimated SMS;
- Name/personalization controls appear only when safe for every recipient;
- inserting a token occurs at the current cursor position;
- Unicode warning appears only when relevant;
- recipient numbers are masked in preparation and review preview;
- review summary is compact and does not show four large metric cards;
- only three recipient rows are visible by default;
- `View all` remains bounded on large recipient sets;
- a shared non-personalized message is not repeated per recipient;
- review has no server-render/snapshot implementation paragraph;
- campaign confirmation still says nothing is sent yet;
- final-send behavior remains unchanged from 0.20.7.

## Release boundary

Frontend `0.20.9`; backend contract `0.18.5`; no SQL migration; no Android change.
