# Web 0.20.3-r1 — Production Routing & Controlled PWA Updates

## Purpose

This corrective release fixes two production-only defects found after Web 0.20.3 deployment:

1. direct or refreshed client routes such as `/dashboard` could return Vercel `404 NOT_FOUND` because the deployment had no SPA fallback rewrite;
2. a client controlled by an older service worker used network-first HTML navigation, so it could load the newly deployed frontend before the user chose **Update now**, making the update prompt misleading.

## Routing correction

The repository now includes root `vercel.json` with one SPA rewrite:

- `/(.*)` → `/index.html`

This lets a fresh browser request for `/dashboard`, `/campaigns`, `/devices`, `/settings`, `/auth/login` and other React Router paths reach the application entry point. React Router remains responsible for route matching and the in-app not-found screen.

## Controlled update correction

A client already controlled by a service worker is pinned to that worker's immutable cached `/` HTML shell. The active shell continues referencing the matching hashed build assets while a newer worker downloads in the background.

The lifecycle is:

1. version A remains active;
2. version B installs and waits;
3. BulkText shows **BulkText update ready**;
4. **Later** keeps version A active for the current controlled session;
5. **Update now** sends `SKIP_WAITING` to the waiting worker;
6. `controllerchange` triggers exactly the existing explicit reload path;
7. version B then serves its own cached shell.

The update prompt shows **Updating…** and disables both update actions while explicit activation is being requested.

## Navigation recovery

If the active worker's shell cache is unexpectedly unavailable, navigation may recover from the network only when the HTTP response is successful. A host 404/5xx is not treated as a valid app shell; the cached offline document is used when available.

## Safety boundaries preserved

- service-worker install does not call `skipWaiting()` automatically;
- Supabase/auth/queue/delivery/gateway requests remain outside service-worker caching;
- manifest `start_url` remains `/` and scope remains `/`;
- authenticated `/` → `/dashboard` behavior is unchanged;
- campaign, queue, delivery, callback/recovery and exact-SIM contracts are unchanged;
- backend contract remains `0.18.5`;
- no database migration is included;
- no Android gateway change is included.

## Post-deploy acceptance

Desktop browser and installed mobile PWA must verify:

- direct `/dashboard` opens without a Vercel 404;
- hard refresh on `/dashboard`, `/campaigns`, `/devices`, `/settings` stays in the SPA;
- with version A active and version B deployed, normal in-app navigation and refresh under the active worker remain on A;
- the update-ready prompt appears after B finishes installing;
- **Later** dismisses the prompt without changing the current controlled build;
- **Update now** visibly enters **Updating…**, activates the waiting worker and reloads once into B;
- offline navigation continues to use the installed shell/fallback;
- online/offline transitions do not cache or replay API requests.
