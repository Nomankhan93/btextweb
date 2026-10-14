# Handoff — Web 0.20.6

`DashboardPage.tsx` is now the Home Dashboard Control Center. It loads five independent read models (gateway, imports, prepared recipient sources, drafts, recent campaign confirmations) and isolates failures with `Promise.allSettled`.

The authoritative Home hierarchy is:

1. Welcome + one `+ New campaign` CTA.
2. `Sending setup`: gateway health, phone, SIM, recipients.
3. Compact Recipients and Message drafts utilities.
4. Latest three confirmed campaigns + `View all campaigns`.

The old dashboard `PwaInstallCard`, Next Action panel, Phone & SIM duplicate card, and Current identity panel are intentionally removed. Global `PwaExperiencePrompts` and the Settings install card remain unchanged.

No delivery/send contract changed. The dashboard is informational and links into the existing workflows. Do not add per-campaign attempt polling to Home; if sent/failed/queued aggregates are added later, expose them through an efficient summary API rather than N+1 attempt reads.

Run `npm run certify:0206` before deployment. After deployment, accept the PWA update and mobile-browser test the Home hierarchy, safe-area bottom navigation, setup statuses, and recent campaign links. No database or Android deployment is required for this release.
