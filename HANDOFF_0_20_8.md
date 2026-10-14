# Handoff — BulkText Web 0.20.8

0.20.8 simplifies campaign creation only. Do not use this release as a reason to weaken the 0.20.7 confirmation/send safety boundary.

## Wizard contract

The creation route uses explicit UI state:

- Step 1 — Campaign
- Step 2 — Recipients
- Step 3 — Message
- Step 4 — Review (separate review route)

`SimpleCampaignPage.tsx` renders only the active editable step. `CampaignConfirmationPage.tsx` continues the stepper with Review active.

`wizardStepForDraft()` is intentionally recovery-aware. A named draft with a parsed file resumes at Recipients; a prepared draft resumes at Message. Do not replace this with the old `currentStep = !parsed ? ...` derived pseudo-stepper, because that pattern caused multiple editable steps to coexist visually.

## Recipient preparation

The server-side sequence is unchanged. `Continue to message` still performs the existing import → validation → preview → bulk-consent → eligibility snapshot → personalization-source sequence before advancing.

Going Back from Message to Recipients does not automatically invalidate or re-run a prepared snapshot. `Change recipient list` remains the explicit action that resets preparation and requires consent again.

Advanced mapping auto-opens only if the phone mapping is missing or smart-detection confidence is low. Optional consent reference remains available but collapsed. When no explicit evidence reference is entered, existing server preparation still falls back to the imported filename.

## Focused mobile shell

`AppShell.tsx` marks `/campaigns/new` and `/campaigns/review/*` with `campaign-wizard-shell`. At mobile widths the global top bar and bottom nav are hidden; each wizard page must therefore retain its own mobile header in loading/error/success states so the user is never trapped.

## Draft reliability

Primary draft copy is simplified, but these safeguards remain authoritative:

- persistent browser draft reconciliation;
- explicit stale-tab conflict choice;
- account/workspace-scoped draft keys;
- local workspace authority never grants preparation/review/send permission;
- beforeunload protection for saving/conflict/failure states;
- server-saved review draft remains authoritative if local durable sync is unavailable.

Run `npm run certify:0208` before deployment. No database or Android deployment is required.
