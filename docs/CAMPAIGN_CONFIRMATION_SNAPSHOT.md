# BulkText 0.14 — Campaign Confirmation Snapshot

0.14 converts an editable message draft into an immutable campaign snapshot. It does **not** send SMS, schedule work, or create cloud queue jobs.

## Confirmation freezes

- source draft revision and message template
- eligible recipient list
- normalized phone numbers
- rendered personalized message per recipient
- GSM-7 / Unicode encoding and segment count per recipient
- total estimated SMS units
- consent/suppression evidence as it existed in the selected eligibility snapshot
- paired Android phone reference
- explicitly selected SIM/subscription reference
- confirmation timestamp

The server renders personalization and recalculates SMS segments during confirmation. Client estimates are review aids, not the authority for stored campaign execution data.

## Immutability

Authenticated clients receive SELECT access to `campaigns` and `campaign_recipients`, but no direct insert/update/delete access. Confirmation is created only through `confirm_campaign(...)`.

Editing or deleting the source draft/import after confirmation does not rewrite stored recipients or rendered messages.

## Sending remains disabled

0.14 intentionally leaves `campaign_send_enabled=false` and `queue_enabled=false`. 0.15 adds gateway preflight and fresh send authorization; 0.16 adds the durable cloud queue.
