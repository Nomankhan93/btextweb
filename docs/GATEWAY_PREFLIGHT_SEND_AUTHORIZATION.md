# BulkText 0.15 — Gateway Preflight & Send Authorization

## Boundary

0.15 adds a server-authoritative safety gate after campaign confirmation and before the future durable queue:

```text
Immutable confirmed campaign
→ Gateway preflight
→ 5-minute send authorization
→ STOP
```

No queue job is created and no Android SMS command is emitted in this phase.

## Preflight checks

`get_campaign_send_preflight(organization_id, campaign_id)` re-checks current execution conditions instead of trusting the older confirmation-time state.

The campaign is Ready only when all of these remain true:

- the immutable campaign snapshot still reconciles with its frozen recipient rows;
- the exact confirmed Android device is still active;
- device heartbeat is no older than 5 minutes;
- SIM inventory is no older than 5 minutes;
- the device's current credential is present, unrevoked and unexpired;
- the current Web binding still points to the exact SIM frozen at confirmation;
- that exact SIM is currently present;
- subscription ID is unchanged;
- slot index is unchanged;
- SIM identity hash is present and unchanged;
- every frozen recipient still has current consent;
- no recipient is currently suppressed.

A current suppression overrides older eligibility evidence stored in the campaign snapshot.

## No SIM fallback

A different active SIM never satisfies preflight. If the confirmed SIM is missing, rebound, moved, replaced, or cannot be identity-verified, authorization is blocked. The campaign must be reconfirmed where required.

## Authorization

`authorize_campaign_send(...)`:

- requires personal-workspace owner permission;
- locks the campaign row to serialize concurrent authorization attempts;
- reruns preflight on the server;
- refuses authorization if any current safety check fails;
- supersedes an older non-revoked authorization;
- stores the exact device/SIM/subscription/slot identity used by preflight;
- expires after 5 minutes;
- writes an audit event.

`revoke_campaign_send_authorization(...)` explicitly revokes the current authorization and writes an audit event.

An authorization is **not** a queue job and **not** an SMS send command.

## Current send status

Even after a successful authorization:

```text
campaign_send_enabled = false
queue_enabled = false
```

0.16 must atomically revalidate/consume a fresh authorization when creating the durable cloud queue. It must not rely on the browser button state.

## Live acceptance

1. Keep Android 0.5 paired and refresh inventory.
2. Open a confirmed campaign.
3. Preflight must show Ready.
4. Authorize send; status must become Authorized with an approximately 5-minute expiry.
5. Revoke; status must become Revoked.
6. Disable the Web-bound SIM and refresh Android inventory.
7. Preflight must block as Missing even when another SIM is still present.
8. Restore the original SIM and refresh inventory; preflight must return Ready.
9. Confirm that no queue jobs exist and no SMS was sent.
