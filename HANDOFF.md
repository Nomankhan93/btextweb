# Current Handoff — Web 0.20.3-r1

Current frontend release: `0.20.3-r1`
Backend contract: `0.18.5`

This corrective release fixes Vercel SPA deep-route 404s and the misleading PWA update lifecycle where network-first HTML could load the new frontend before **Update now** was chosen.

Root `vercel.json` now rewrites client routes to `/index.html`. An already controlled client is pinned to the active worker's immutable cached shell; a newer worker may download in the background but remains waiting until **Update now** sends `SKIP_WAITING`. **Later** only dismisses the prompt for the current provider session. Update activation keeps the existing controller-change single reload and now shows **Updating…** while applying.

No database migration or Android release is included. Campaign delivery, queue, callback/recovery, exact-SIM authorization, auth/session and workspace contracts are unchanged.

Primary certification: `npm run certify:0203r1`. After it passes, run `git diff --check`, deploy, and smoke-test direct-route refresh plus explicit update activation on desktop and installed mobile PWA.
