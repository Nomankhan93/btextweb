# Phone & SIM Readiness Control Center — Web 0.20.11

## Goal

Turn Phone & SIM from a device-inventory/diagnostics page into a sending-readiness control center without weakening explicit-SIM, pairing, stale-gateway or confirmed-campaign safety.

## Readiness truth

A route is shown as **Ready to send** only when one active paired Android phone has:

- current gateway health (`recent`);
- an explicit selected SIM;
- the selected SIM still present (`bindingStatus === ready`).

A paired phone is not described as ready merely because the account relationship exists. Stale/offline/never-seen gateway state remains an attention condition.

## State model

- **Phone not connected** — no active paired phone; pairing is primary.
- **Choose a SIM** — active paired phone exists but no SIM is selected.
- **Selected SIM missing** — the selected SIM is no longer present; no fallback is allowed.
- **Phone needs attention** — selected SIM remains valid but gateway freshness is not current.
- **Ready to send** — at least one active phone has current gateway health and a present selected SIM.

The shared `gatewayWorkspaceReadiness()` helper is also used by Home so readiness meaning does not diverge between screens.

## Progressive disclosure

Primary Phone & SIM UI shows only:

- readiness;
- active phone identity;
- gateway freshness;
- selected SIM;
- available SIM choices.

Android/API version, Gateway build, credential version, device ID and exact timestamps remain under **Device details**. Revoked phones and pairing history are collapsed secondary sections.

## Pairing

When no active phone exists, pairing is the primary task. Once an active phone exists, pairing is demoted to **Pair another phone**. Pairing URI and cancellation stay under **More options**.

## SIM actions

- `Bound` becomes **Selected**.
- `Clear SIM` becomes **Unselect SIM**.
- SIM switching uses `ActionDialog` and explains that confirmed campaigns keep their locked phone/SIM snapshot and still require that exact SIM at send time.
- Unselect and disconnect are explicit branded destructive confirmations.

## Release boundary

Frontend `0.20.11`; backend contract `0.18.5`; no database migration; no Android change.
