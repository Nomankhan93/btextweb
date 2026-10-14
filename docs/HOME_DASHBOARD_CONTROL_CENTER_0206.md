# BulkText Web 0.20.6 — Home Dashboard Control Center

## Goal

Turn Home/Dashboard from repeated setup cards into one compact operational control center without changing sending authorization, queue behavior, database schema, navigation contracts, or the global BulkText brand.

## Dashboard contract

- Exactly one `+ New campaign` action is presented on Home.
- The duplicated Next Action panel is removed.
- The dashboard-specific PWA install card is removed; the existing global PWA install/update experience remains authoritative.
- Phone, selected SIM, gateway health, and prepared recipient count are consolidated into one `Sending setup` module.
- Gateway wording uses the existing `healthStatus` values (`recent`, `stale`, `offline`, `never_seen`, `revoked`) rather than a generic Ready label.
- Recipient preparation and message drafts remain as compact utility modules.
- The latest three confirmed campaigns are shown using the existing `listCampaignConfirmations` API, with a link to full campaign history.
- Home does not claim delivery aggregates that the existing summary API does not provide.

## Resilience contract

Home loads gateway devices, imports, prepared recipient sources, drafts, and campaign history through `Promise.allSettled`.

A failed resource must not blank successful sibling resources. In particular:

- campaign-history failure leaves sending setup, recipients, and drafts usable;
- gateway failure is shown as `Unavailable`, not falsely as `Not paired`;
- a compact status notice identifies which dashboard areas could not be refreshed.

## Responsive contract

- Existing `1180px` app content width remains unchanged.
- Existing desktop sidebar and mobile bottom navigation remain unchanged.
- `MY BULKTEXT` is hidden on narrow mobile screens to reduce first-viewport height.
- Sending setup becomes a 4-column strip on desktop and a 2×2 grid at tablet/mobile widths.
- Recent campaign rows collapse cleanly on narrow screens.

## Release boundaries

- Frontend version: `0.20.6`
- Backend contract: `0.18.5`
- No Supabase migration.
- No Android change.
- No change to campaign confirmation, send authorization, durable queue, callback/recovery, or account/workspace authorization behavior.
