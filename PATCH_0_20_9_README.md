# BulkText Web 0.20.9 — Message & Review Experience

This release makes message composition and final review shorter, more useful and less technical while retaining all existing campaign confirmation/send safety.

## What changed

- Composer now shows a compact live line for characters, encoding, segments and estimated SMS.
- Unicode/Mixed encoding displays a contextual segment-capacity warning.
- Personalization is button-driven instead of requiring users to memorize token syntax.
- Personalization buttons are shown only when every prepared recipient has that field.
- Safe custom fields are supported alongside name/first name/last name/phone.
- Recipient numbers are masked in preparation/review previews.
- Review replaces four metric cards with one compact summary strip.
- Review defaults to three recipient examples and provides an explicit `View all N recipients` disclosure capped at 100 rendered rows.
- Non-personalized messages are shown once rather than duplicated for every recipient.
- Sending phone/SIM is represented by a compact user-facing summary.
- Duplicate server-render/snapshot/exact-SIM implementation prose is removed from the normal review path.
- Confirmation still states `Nothing is sent yet.` and remains separate from final sending.

## Apply

Apply this patch to BulkText Web `0.20.8`:

```bash
bash /path/to/bulktext-web-0.20.9-patch/apply.sh /home/noman/projects/bulktext-web-0.4.0
cd /home/noman/projects/bulktext-web-0.4.0
npm ci
npm run certify:0209
git diff --check
```

## Database / Android

No new migration. Backend contract remains `0.18.5`. No Android change is included.
