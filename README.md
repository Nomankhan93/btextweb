# Web 0.20.3-r1 — Production Routing & Controlled PWA Updates

BulkText Web `0.20.3-r1` is a narrow corrective release over the certified `0.20.3` frontend. It fixes production deep-route `404_NOT_FOUND` responses on Vercel and restores the intended user-controlled PWA update lifecycle.

The deployment now owns an SPA fallback through root `vercel.json`, so direct/refreshed routes such as `/dashboard`, `/campaigns`, `/devices`, `/settings` and `/auth/login` reach React Router instead of a hosting-provider 404 page.

For clients already controlled by a service worker, navigation now uses the immutable installed app shell rather than network-first HTML. A newer worker can download and wait in the background, but the active frontend stays version-consistent until the user chooses **Update now**. The prompt shows **Updating…** while explicit activation is requested. **Later** continues to dismiss the prompt without changing the current controlled session.

Frontend version is `0.20.3-r1`; backend contract remains `0.18.5`. No Supabase migration, database contract change, campaign/send change, exact-SIM change or Android gateway release is included.

Run `npm run certify:0203r1` in WSL on Node `24.21.0`, then `git diff --check` before deployment.

See `PATCH_0_20_3_R1_README.md`, `HANDOFF_0_20_3_R1.md`, `VALIDATION_0_20_3_R1.md` and `docs/PRODUCTION_ROUTING_PWA_CONTROLLED_UPDATE_0203R1.md`.
