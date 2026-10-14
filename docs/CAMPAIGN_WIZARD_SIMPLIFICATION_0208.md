# Campaign Wizard Simplification — Web 0.20.8

## Goal

Make campaign creation feel like a focused four-step task while preserving BulkText's existing local-draft, consent/suppression, confirmation, exact-SIM and send-safety boundaries.

## UX model

### 1. Campaign

The user enters the campaign name and chooses `Continue to recipients`.

### 2. Recipients

The user uploads CSV/XLSX recipients. BulkText shows a compact validation summary, smart phone-column detection, optional advanced mapping, consent declaration and optional consent reference. `Continue to message` performs the same authoritative preparation sequence as before.

### 3. Message

The user writes the SMS. Existing personalization validation and SMS estimates remain unchanged in this release. Back returns to the already prepared recipient step without repeating server writes.

### 4. Review

Review remains a separate server-backed route and continues the stepper. The 0.20.7 branded confirmation dialog still creates the confirmed snapshot and explicitly sends nothing.

## Mobile shell

On `/campaigns/new` and `/campaigns/review/:id`, mobile global chrome is intentionally hidden to avoid bottom-nav/keyboard competition and accidental workflow exits. A route-local header provides the safe return/exit path, including loading and error states.

## Non-goals

0.20.8 does not redesign message metrics or the complete review information hierarchy; those can be handled separately. It also does not change database schema, authorization, queueing, Android execution or delivery-state semantics.
