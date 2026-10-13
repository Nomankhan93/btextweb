# Validation — Web 0.20.1

## Required environment

- WSL2 Ubuntu
- Node `24.21.0`
- clean dependency install with `npm ci`

## Automated certification

```bash
nvm use 24.21.0
npm ci
npm run certify:0201
git diff --check
./scripts/release-package.sh
git status
```

`certify:0201` includes:

1. 0.20.1 PWA install/update source contract
2. 0.20.1 install/update runtime regressions
3. preserved 0.20.0 launch source contract
4. preflight
5. accessibility/form regressions
6. auth/session/workspace regressions
7. observability/privacy regressions
8. bootstrap/lazy-route regressions
9. TypeScript check
10. complete Vitest suite
11. production Vite build
12. 0.19.6-r1 bundle budget
13. service-worker/PWA shell integrity

## Expected install behavior

- automatic prompt appears only after `beforeinstallprompt`;
- **Not now** suppresses the automatic card for three days;
- manual public-navigation **Install App** remains possible while `canInstall` is true;
- accepted installation hides install actions;
- standalone mode never offers installation.

## Expected update behavior

- registration/reconnect/foreground checks can discover a newer worker;
- waiting update shows **Update now / Later**;
- **Later** keeps the existing app session;
- the same waiting worker does not immediately re-prompt;
- a different waiting worker may prompt again;
- **Update now** sends `SKIP_WAITING`;
- reload happens on `controllerchange`;
- service-worker install never forces `skipWaiting()`.

## Post-deploy mobile smoke

Use deployed mobile Chrome/PWA, not an Android app build, for this web patch:
1. open the website in a normal browser;
2. confirm install prompt appears when Chrome marks it installable;
3. dismiss and verify the automatic prompt stays hidden;
4. install through the manual menu action;
5. confirm install UI is absent in standalone mode;
6. deploy a newer test build and verify update-ready UX without forced mid-session reload.
