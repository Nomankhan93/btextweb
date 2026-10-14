# Campaign Message & Review Experience — Web 0.20.9

## Scope

0.20.9 improves the message-writing and campaign-review experience without changing the confirmation/send safety model.

### Composer

- Prepared-recipient data determines which personalization fields are safe to insert.
- A field is offered only when every prepared recipient has a value for that token.
- Built-in name/first-name/last-name/phone fields and safe custom fields can be inserted at the current caret position.
- Characters, encoding, segment range and estimated SMS are presented in one live summary line.
- Unicode/Mixed encoding gets an attention message only when it actually applies.
- The previous three large message metric cards are removed.

### Review

- Review uses one compact summary for recipients, estimated SMS, encoding and segment range.
- Message, sending phone/SIM and recipients are the primary sections.
- Recipient phone numbers are masked on preparation/review preview surfaces.
- The default review shows at most three recipients; the explicit disclosure can show up to 100 to avoid unbounded DOM work for large campaigns.
- Shared messages are shown once rather than repeated for every recipient. Personalized campaigns show rendered examples.
- Server-render/snapshot implementation explanations and duplicate exact-SIM prose are removed from the normal review path.

## Safety boundary

Unchanged from 0.20.7/0.20.8:

- confirmation still locks the campaign but sends nothing;
- all personalization is verified against prepared recipient rows;
- confirmation still requires complete rendered messages and a ready selected phone/SIM;
- final send remains a separate branded confirmation with fresh preflight and send authorization;
- no recipient eligibility, suppression, queue, callback or recovery contract changes.

## Backend / Android

Frontend `0.20.9`; backend contract `0.18.5`; no SQL migration; no Android change.
