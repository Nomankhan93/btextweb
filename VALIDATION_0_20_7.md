# Validation — BulkText Web 0.20.7

## Completed in artifact build environment

- `node scripts/test-campaign-confirmation-send-safety0207-source.mjs` — **PASS** (32 assertions).
- `node scripts/preflight.mjs` — **PASS** (`BulkText Web 0.20.7 / backend 0.18.5 preflight PASS`).
- All 24 package source-contract scripts (`test:*source*`) — **PASS**.
- TypeScript/TSX syntactic transpilation of `ActionDialog.tsx`, campaign confirmation/detail pages, and touched/new tests using the available global TypeScript compiler — **PASS**.
- `src/styles/app.css` parsed with PostCSS — **PASS**.
- Release source inspection confirms no 0.20.7 Supabase migration was added and backend contract remains `0.18.5`.

## Environment limitation

The clean source artifact does not include `node_modules`. An offline `npm ci --offline` attempt could not complete because the npm cache does not contain every required package (`ENOTCACHED`, beginning with `yallist-3.1.1.tgz`). Therefore Vitest, project semantic type-checking, and the Vite production build must be run in the normal WSL project environment with dependencies available.

Run:

```bash
npm ci
npm run certify:0207
git diff --check
```

`certify:0207` runs:

1. 0.20.7 campaign confirmation/send safety source contract;
2. project preflight;
3. TypeScript project check;
4. focused final-send/dialog/campaign UX regressions;
5. full Vitest suite;
6. production build.

## Deployment verification

After deployment and controlled PWA update, verify on desktop and mobile browser:

- `Confirm campaign?` uses the branded dialog and clearly states that nothing is sent yet;
- confirmed campaign places the real-send action near the top;
- `Start sending to N recipients` opens the final branded consequence dialog;
- rapid repeated activation does not start duplicate client-side authorize/enqueue sequences;
- failed fresh preflight creates no authorization or queue;
- frozen recipient rows remain within the mobile viewport without horizontal clipping;
- Technical send details remain collapsed and primary UI does not expose the retired version-specific safety callout.

## Release boundary

Frontend `0.20.7`; backend contract `0.18.5`; no new SQL migration; no Android change.
