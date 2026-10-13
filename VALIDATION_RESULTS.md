# Validation — Web 0.20.3-r1

Web `0.20.3-r1` preserves the certified `0.20.3` application/backend behavior and adds production routing plus controlled-update gates.

The release is accepted only after `npm run certify:0203r1` passes. The focused checks protect the Vercel SPA rewrite, immutable active service-worker shell, host-404/offline fallback, explicit `SKIP_WAITING` activation and **Updating…** UI state. The corrective certifier then runs the existing `0.20.3` production certification to retain auth, landing, accessibility, observability, route loading, TypeScript, full Vitest, build and bundle regressions.

Deployment smoke remains mandatory because Vercel routing and browser service-worker activation are hosting/browser behaviors: direct `/dashboard` and other deep routes must refresh without `404_NOT_FOUND`, and an older controlled build must not silently adopt a newer deployment before **Update now** is selected.
