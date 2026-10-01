# BulkText 0.11 — Consent & Suppression

## Purpose

0.11 adds the compliance gate between an immutable recipient preview and later campaign/message workflow stages.

A structurally valid recipient from 0.10 is **not** automatically eligible. BulkText evaluates two independent organization-scoped records:

1. current consent evidence;
2. current suppression state.

The 0.11 policy is `consent-suppression-v1`.

## Eligibility rule

A recipient is eligible only when:

- the latest consent event is `granted`;
- the grant is not expired; and
- the latest suppression state is `clear`.

Suppression always overrides consent.

Blocked reasons are explicit:

- `no_consent`
- `consent_revoked`
- `consent_expired`
- `suppressed`

No consent is inferred from a phone number, an import, an organization membership, or previous message activity.

## Consent evidence

Consent is append-only in `contact_consent_events`.

Supported events:

- `granted`
- `revoked`

Supported sources:

- `web_form`
- `paper_form`
- `verbal`
- `import`
- `api`
- `manual`
- `other`

Every consent event requires an evidence note or evidence reference. Grants may optionally carry an expiry timestamp. Revocations cannot carry an expiry.

Owner, Admin and Campaign Manager may append consent events. Detailed evidence history is exposed through an RPC only to those roles; raw evidence tables are not browser-writable and are not directly exposed to authenticated clients.

## Suppression

Suppression is append-only in `contact_suppression_events`.

Supported state events:

- `suppressed`
- `lifted`

Suppression reasons:

- `opt_out`
- `complaint`
- `manual`
- `regulatory`
- `other`

Owner, Admin and Campaign Manager may add a suppression. Only Owner/Admin may lift a current suppression, and lifting requires an explanatory note.

## Recipient eligibility snapshots

`list_recipient_eligibility_rows` evaluates the **current** consent/suppression state for only the `included` rows of a 0.10 recipient preview.

`create_recipient_eligibility_snapshot` freezes that result into:

- `recipient_eligibility_snapshots`
- `recipient_eligibility_rows`

Later consent or suppression changes do not mutate an older snapshot. A new snapshot revision must be created to reflect newer evidence.

## Security model

- all compliance data is organization-scoped;
- RLS protects readable snapshot tables;
- consent/suppression writes are RPC-only;
- detailed evidence history is manager-role only;
- cross-tenant RPC access is rejected;
- audit events are written for consent, suppression and eligibility snapshot actions.

## Deliberate boundary

0.11 does **not**:

- compose message content;
- create campaign drafts;
- calculate SMS segments;
- confirm a campaign;
- queue Android gateway work;
- send SMS.

The next roadmap phase is `0.12 — Message Composer & Personalization`.
