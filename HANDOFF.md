# Handoff — BulkText Web 0.20.12

Direct integration from 0.20.5-r1. All six frontend patch payloads are included with corrections. Do not layer the old patches over this release.

Safety invariants: immutable confirmed recipient/message/phone/SIM snapshot; explicit final confirmation before enqueueing on every visible queue path; fresh backend preflight → authorization → enqueue; immediate duplicate-submit guard; no fallback SIM; no automatic resend of UNKNOWN or callback failures; offline writes remain blocked.

Dashboard refresh dependencies use workspace ID rather than object identity. Phone & SIM downgrades failed refreshes to “Status unavailable” while keeping last-known cards. A review SIM label is not a fresh send-authorization claim. Pending attempts alone do not mean SMS sending has started.

ActionDialog uses stable open/close focus lifecycle and latest callbacks, and unique accessible IDs. Wizard step changes focus the section. Recipient expansion is explicitly limited to the first 100 and does not repeat the initial three.

Run npm run certify:02012. Database and Android code need no deployment for this patch. See VALIDATION_0_20_12.md for execution evidence and unperformed browser/device acceptance.
