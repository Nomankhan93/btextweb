# Current Patch — Web 0.20.3-r1

`0.20.3-r1 — Production Routing & Controlled PWA Updates` fixes two production defects without changing the backend or send contract.

## Included
- Vercel SPA fallback: `/(.*)` → `/index.html`;
- direct and refreshed React Router paths no longer depend on a physical server file;
- controlled service-worker navigation stays pinned to the active versioned shell;
- newly downloaded workers remain waiting until explicit **Update now** activation;
- HTTP 404/5xx navigation is not treated as a valid replacement app shell;
- update prompt shows **Updating…** and prevents duplicate activation clicks;
- focused source/runtime regressions plus the full certified 0.20.3 baseline.

## Not included
No Supabase migration, RLS/RPC change, authentication contract change, campaign/send/queue/delivery/recovery change, SIM-selection change, Android gateway change, or product redesign.

## Validate
```bash
nvm use 24.21.0
npm ci
npm run certify:0203r1
git diff --check
```
