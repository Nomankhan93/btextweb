# Campaign Delivery Experience — Web 0.20.10

## Goal

Present real campaign execution progress using the delivery data BulkText already has, without inventing delivery certainty or weakening duplicate-send protection.

## Authoritative evidence

### Queue evidence

`CampaignDispatch` exposes cloud/Android handoff counts:

- queued jobs;
- leased jobs;
- downloaded/ACKed jobs.

Downloaded/ACKed means Android received the durable job. It does **not** mean carrier SENT or recipient DELIVERED.

### Attempt evidence

Latest message-attempt state is one of:

- `prepared`;
- `submitted`;
- `sent`;
- `delivered`;
- `failed`;
- `unknown`.

`sent` and `delivered` are deliberately distinct. `unknown` is deliberately distinct from failure because an external SMS effect may already have happened.

## Derived presentation

`processedDeliveryJobs()` counts:

- SENT;
- DELIVERED;
- FAILED;
- UNKNOWN already resolved without resend.

It excludes:

- awaiting attempt;
- prepared;
- submitted;
- unresolved UNKNOWN.

This prevents an unresolved ambiguity from making the campaign appear complete.

## Main live states

- **Waiting for phone** — durable jobs remain in the cloud.
- **Phone receiving jobs / Starting on phone** — Android handoff is underway or complete but attempt status is not yet available.
- **Sending in progress** — recipient attempts remain active.
- **Needs attention** — unresolved UNKNOWN exists.
- **Completed with issues** — terminal failed outcomes exist.
- **Completed with unverified results** — UNKNOWN was explicitly resolved without resend.
- **Sending complete** — all recipients have complete SENT success, but DELIVERED receipts may still arrive.
- **Delivery confirmed** — every recipient reports DELIVERED.

## UNKNOWN recovery

The only exposed recovery action is `skip_unknown`. The user explicitly confirms continuing without resending UNKNOWN recipients. BulkText does not make a SENT or DELIVERED claim for those recipients.

## Polling

No new polling layer was added. The page keeps `useCampaignLiveStatus` and the existing adaptive polling/backoff behavior.

## Release boundary

Frontend `0.20.10`; backend contract `0.18.5`; no migration; no Android change.
