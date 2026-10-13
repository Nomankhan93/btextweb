# Web 0.20.3-r1 — Production Routing & Controlled PWA Updates

## Baseline
Built on Web `0.20.3 — Auth Screen Mobile Polish`.

Frontend version: `0.20.3-r1`
Backend contract: `0.18.5`
Database migration: **none**
Android change: **none**

## Bugs fixed

### BUG-01 — Vercel deep-route 404
Adds root `vercel.json` so direct/refreshed React Router URLs rewrite to `/index.html` instead of returning the hosting provider `404_NOT_FOUND` page.

### BUG-02 — Update prompt appeared after the new app was already loaded
Changes controlled service-worker navigation from network-first HTML to the immutable installed shell. A newly deployed build can install a waiting worker in the background, but the currently controlled app does not adopt that build until **Update now** sends `SKIP_WAITING`.

The prompt now shows **Updating…** and disables duplicate actions while activation is requested.

## Preserved contracts
- no auth/session behavior change;
- no manifest start URL/scope change;
- no Supabase schema/RLS/RPC/migration change;
- no campaign/send/queue/delivery/recovery change;
- no exact-SIM authorization change;
- no Android gateway change;
- no automatic service-worker `skipWaiting()` during install.

## Validate
```bash
nvm use 24.21.0
npm ci
npm run test:routing-pwa-source-0203r1
npm run test:pwa-shell-01810r1
npm run test:pwa-install-update-0201
npm run certify:0203r1
git diff --check
```

After deployment, test deep-link refresh and explicit update activation on both desktop browser and the installed mobile PWA.
