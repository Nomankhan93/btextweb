# BulkText Web 0.20.7 — Campaign Confirmation & Send Safety UX

## Goal

Make the campaign confirmation and real-send boundary obvious, branded, mobile-safe, and resistant to accidental duplicate activation without weakening BulkText's existing confirmation snapshot, exact-SIM preflight, short-lived authorization, durable queue, callback, or recovery contracts.

## Confirmation contract

- Campaign confirmation remains separate from execution.
- `Confirm campaign` locks recipients, rendered messages, phone, and selected SIM; it does not send SMS.
- Native browser confirmation is replaced by the shared branded `ActionDialog`.
- The dialog states `Nothing will be sent yet` and summarizes campaign, recipients, estimated SMS, and selected phone/SIM.
- The page no longer uses `Immutable confirmation` / `Freeze this campaign` as primary user language.

## Final send contract

- The primary confirmed-campaign action is `Start sending to N recipients`; `Send to Android` is retired from the main workflow.
- A branded final dialog states that sending begins immediately after the final safety check.
- The existing execution order is unchanged: fresh campaign preflight → fresh send authorization → durable queue creation.
- If final preflight fails, no authorization/queue is created and the user sees the blocker.
- An immediate in-memory `sendInFlight` guard prevents rapid double activation from starting duplicate client-side send sequences. Existing database idempotency remains authoritative underneath.

## Confirmed campaign hierarchy

- Ready/send status and action appear near the top of the confirmed campaign page.
- Primary content uses user-facing `Confirmed sending setup` wording and hides the internal subscription ID.
- Technical preflight, authorization, queue identifiers, exact subscription IDs, and callback safety details remain under collapsed `Technical send details`.
- The release-specific `0.18.1 safety boundary` callout is removed from normal UI while its safety behavior remains unchanged.

## Mobile overflow contract

- Confirmed-campaign content must not require horizontal scrolling at narrow widths.
- Frozen-recipient table rows become labeled stacked cards at `max-width: 700px` and the desktop `1080px` minimum width is overridden.
- Long campaign, phone/SIM, message, and technical text must wrap within the viewport.
- The final send CTA is full-width and wrapping-safe on mobile.

## Dialog accessibility contract

`ActionDialog` provides:

- `role="dialog"` and `aria-modal="true"`;
- safe cancel action focused by default;
- Tab/Shift+Tab focus trapping;
- Escape dismissal while idle;
- no Escape dismissal while an irreversible action is busy;
- focus restoration to the previously focused trigger after close.

## Release boundaries

- Frontend version: `0.20.7`
- Backend contract: `0.18.5`
- No Supabase migration.
- No Android change.
- No change to recipient eligibility, confirmation snapshot contents, exact-SIM preflight semantics, authorization TTL, durable queue idempotency, callback interpretation, UNKNOWN behavior, or recovery policy.
