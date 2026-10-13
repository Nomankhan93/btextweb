# Web 0.20.2 — Landing Page Conversion & Mobile UX

BulkText Web `0.20.2` tightens the public landing page around one dominant message: **Business SMS, sent from your own SIM.** The patch reduces mobile vertical density, moves the product proof closer to the hero, compacts workflow/features/comparison content, improves the Android gateway presentation, and strengthens public-navigation and FAQ accessibility.

The landing page keeps the established BulkText navy/blue/cyan brand, factual carrier-cost wording, exact SIM routing story, delivery/recovery caveats, and the `0.20.1` conditional **Install App** experience. No analytics stack is added.

Frontend version is `0.20.2`; backend contract remains `0.18.5`. No database migration, auth behavior, campaign/send workflow, gateway/SIM protocol, delivery state machine, service-worker fetch strategy, or PWA install/update lifecycle change is included. The service-worker cache version advances only so installed clients receive the new static landing assets.

Run `npm run certify:0202` in WSL on Node `24.21.0`, then `git diff --check` and `./scripts/release-package.sh`.

See `PATCH_0_20_2_README.md`, `HANDOFF_0_20_2.md`, `VALIDATION_0_20_2.md` and `docs/LANDING_CONVERSION_MOBILE_UX_0202.md`.
