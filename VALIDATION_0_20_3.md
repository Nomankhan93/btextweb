# Validation — Web 0.20.3

## Required automated gate
```bash
npm run certify:0203
```

The certifier runs the 0.20.3 auth source/runtime tests, 0.20.2 landing regressions, 0.20.1 PWA install/update regressions, launch/preflight, accessibility, auth/session, observability, bootstrap/lazy routing, TypeScript, the full Vitest suite, production build, bundle budget and PWA shell integrity.

## Release gate
```bash
git diff --check
./scripts/release-package.sh
```

## Post-deploy mobile smoke
Verify at 320/360/390/412px-class widths:
- Sign In and Create Account start at the same top rhythm rather than different vertical centering;
- no horizontal overflow;
- keyboard-open pages scroll naturally and the primary CTA remains reachable;
- password Show/Hide changes only visibility and never submits the form;
- password guidance remains associated on signup;
- default/autofill/focus states remain readable;
- loading labels and disabled controls are visible while requests are pending;
- existing auth redirects and PWA/landing behavior remain unchanged.
