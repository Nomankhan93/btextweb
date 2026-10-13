# Validation — Web 0.20.0

## Required environment

- WSL2 Ubuntu
- Node `24.21.0`
- clean dependency install with `npm ci`

## Automated certification

```bash
nvm use 24.21.0
npm ci
npm run certify:0200
git diff --check
./scripts/release-package.sh
git status
```

`certify:0200` includes:

1. 0.20.0 launch source contract
2. preflight
3. accessibility/form focused regressions
4. auth/session/workspace boundary regressions
5. observability/privacy regressions
6. bootstrap/lazy-route regressions
7. TypeScript check
8. complete Vitest suite
9. production Vite build
10. 0.19.6-r1 bundle budget
11. service-worker/PWA shell integrity

## Post-deploy evidence

Automated source/build certification does not replace deployed-browser or physical Android gateway smoke. Complete the checklist in `docs/PRODUCTION_LAUNCH_BASELINE_0200.md`.
