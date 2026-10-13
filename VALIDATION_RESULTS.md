# Validation — Web 0.20.0

The 0.20.0 launch source contract and preflight freeze the approved 0.19.x safety/performance/accessibility invariants. Runtime certification is consolidated under `npm run certify:0200` and must be performed in WSL on Node `24.21.0`.

The source artifact does not claim deployment or physical-device smoke. After automated certification and deterministic release packaging, complete the post-deploy launch checklist in `docs/PRODUCTION_LAUNCH_BASELINE_0200.md`.
