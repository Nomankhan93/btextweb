# Handoff — Web 0.20.3-r1

`0.20.3-r1 — Production Routing & Controlled PWA Updates` is a narrow production reliability correction over `0.20.3`.

It fixes Vercel deep-route 404s with a repository-owned SPA rewrite and restores the intended user-controlled PWA update contract by pinning controlled navigations to the active worker's immutable cached shell. A newer worker may download in the background, but **Update now** is the action that requests activation and the subsequent single reload.

Frontend: `0.20.3-r1`
Backend contract: `0.18.5`
Database migration: none
Android change: none

Primary certification:
```bash
npm run certify:0203r1
git diff --check
```

Post-deploy smoke must cover direct `/dashboard`, hard refresh on authenticated routes, **Later**, **Update now**, installed-PWA relaunch, and offline navigation.
