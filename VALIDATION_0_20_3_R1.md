# Validation — Web 0.20.3-r1

## Targeted gates
```bash
npm run test:routing-pwa-source-0203r1
npm run test:pwa-shell-01810r1
npm run test:pwa-install-update-0201
npm run test:public-root-0191
```

The targeted contract verifies the Vercel SPA fallback, service-worker release identity, installed-shell version pinning, HTTP 404/offline fallback behavior, explicit `SKIP_WAITING`, and visible **Updating…** state.

## Full corrective certification
```bash
npm run certify:0203r1
```

The corrective certifier runs the focused routing/PWA gates and then the certified `0.20.3` baseline regressions, including preflight, TypeScript, full Vitest, production build, bundle budget and service-worker shell integrity.

## Release gate
```bash
git diff --check
```

## Post-deploy smoke
- direct-load and hard-refresh `/dashboard`, `/campaigns`, `/devices`, `/settings`, `/auth/login`;
- verify no Vercel `404_NOT_FOUND` page;
- keep an older controlled build open while deploying a newer build and confirm the UI does not silently switch builds;
- choose **Later** and verify the current controlled session remains usable;
- choose **Update now**, observe **Updating…**, then verify one reload into the newly deployed build;
- verify installed mobile PWA behavior and offline navigation.
