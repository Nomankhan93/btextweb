# Handoff — BulkText Web 0.20.9

0.20.9 improves Message and Review only. Preserve the one-step wizard from 0.20.8 and the separate confirmation/send safety boundary from 0.20.7.

## Composer contract

`availablePersonalizationTokens()` offers a token only if every prepared recipient has a value. Do not change this to “available for any recipient”; doing so would knowingly create missing-render failures.

The composer inserts tokens at the current textarea selection/caret and keeps the existing `analyzeMessageTemplate()` / `estimatePersonalizedSmsUsage()` validation authoritative.

The primary metrics surface is `message-live-summary`: characters, encoding, segment range and estimated SMS. Unicode warning is conditional, not decorative.

## Review contract

`CampaignConfirmationPage` keeps these primary questions visible:

- campaign/message;
- recipients;
- estimated SMS / encoding / segment range;
- exact selected phone/SIM;
- confirm action with “Nothing is sent yet.”

Default recipient preview is capped at three. Expanded preview is capped at 100 DOM rows. Phone numbers are masked on these review surfaces.

For non-personalized messages, the message is shown once in the Message section and is not repeated per recipient. Personalized campaigns may show rendered recipient examples.

## Safety boundary

Do not merge Confirm with Start sending. Confirmation still creates the locked snapshot only. The 0.20.7 final-send dialog, fresh phone/SIM preflight, authorization, durable queue and duplicate-submit guard remain unchanged.

Run `npm run certify:0209` before deployment. No database or Android deployment is required.
