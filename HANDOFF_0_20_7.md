# Handoff — BulkText Web 0.20.7

0.20.7 changes user-facing confirmation/send safety only. The underlying delivery architecture remains unchanged.

The authoritative sequence is still:

1. Review draft and choose an active phone/SIM.
2. `Confirm campaign` creates the immutable confirmed snapshot. **No SMS is sent.**
3. Confirmed campaign shows `Start sending to N recipients` near the top.
4. Final branded confirmation summarizes recipient count, estimated SMS, phone, and SIM.
5. On confirmation, Web performs fresh preflight → fresh authorization → durable queue creation.
6. Android executes the queued work under the existing exact-SIM/callback/recovery contract.

`ActionDialog.tsx` is the shared branded modal introduced by this release. It defaults focus to Cancel, traps keyboard focus, supports Escape while idle, blocks Escape while busy, and restores trigger focus.

`CampaignDetailPage.tsx` has an immediate `sendInFlight` ref guard. Do not remove it just because durable queue creation is idempotent; the UI guard prevents duplicate client sequences and confusing repeated state transitions.

The internal subscription ID, preflight diagnostics, authorization controls, queue details, and delivery safety implementation remain available under `Technical send details`. Do not restore `0.18.1 safety boundary` or `Send to Android` as primary user-facing copy.

Mobile frozen recipients intentionally switch from the desktop table to stacked labeled rows through CSS; preserve the `data-label` attributes if recipient columns change.

Run `npm run certify:0207` before deployment. No database or Android deployment is required.
