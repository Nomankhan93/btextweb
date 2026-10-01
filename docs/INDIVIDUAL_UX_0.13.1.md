# BulkText 0.13.1 — Individual UX Cleanup

This patch simplifies the authenticated web UI around the Individual-First product model.

## Primary navigation

The main navigation is intentionally reduced to:

- Dashboard
- Campaigns
- Phone & SIM
- Settings

Recipient upload, validation, consent/do-not-send checks and message composition remain implemented and reachable through the Dashboard/Campaigns workflow. They are no longer presented as permanent top-level product modules.

## User-facing terminology cleanup

The patch removes development/internal language from normal user screens, including policy/version badges and implementation terms such as `pk-mobile-v1`, `consent-suppression-v1`, `bulktext-template-v1`, "Normalization Lab", "Security Ledger", "Sending invariant", and placeholder wording about routes existing only for development.

## Behavior intentionally unchanged

- no Supabase migration
- no RLS/RPC changes
- no recipient validation rule changes
- no consent/suppression policy changes
- no message-personalization rule changes
- no SMS-segment calculation changes
- no device-pairing security changes
- no SIM binding/fallback changes
- no SMS sending enabled

## Next feature

0.14 — Campaign Confirmation Snapshot.
