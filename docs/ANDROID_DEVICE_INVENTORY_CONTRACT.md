# BulkText Android Device Inventory Contract — Web/Cloud 0.7.0

This contract extends the 0.6 secure-pairing protocol. The Android gateway must already have a valid `device_id` and device-scoped credential from `claim_gateway_pairing`.

## Goal

Report enough gateway and SIM state for the web dashboard to make one explicit SIM subscription the selected sending identity. Reporting inventory does **not** enable campaign sending by itself.

## RPC

```text
report_gateway_device_inventory(
  p_device_id uuid,
  p_credential text,
  p_device jsonb,
  p_sims jsonb
)
```

The function is callable without a Supabase user login because it re-authenticates the gateway using its device credential. Never ship a service-role key or Owner/Admin session in the APK.

## Device payload

Example:

```json
{
  "manufacturer": "vivo",
  "model": "V2109",
  "androidRelease": "13",
  "sdkInt": 33,
  "appVersion": "0.7.0-android",
  "appVersionCode": 70,
  "batteryPercent": 82
}
```

All fields are metadata only. `batteryPercent` must be 0–100 when present.

## SIM payload

Example dual-SIM report:

```json
[
  {
    "subscriptionId": 1,
    "slotIndex": 0,
    "carrierName": "Ufone",
    "displayName": "Ufone",
    "countryIso": "pk",
    "isEmbedded": false
  },
  {
    "subscriptionId": 3,
    "slotIndex": 1,
    "carrierName": "Jazz",
    "displayName": "Jazz",
    "countryIso": "pk",
    "isEmbedded": false
  }
]
```

`subscriptionId` is the Android subscription that later sending code must use. `slotIndex` is zero-based (`0` = SIM 1, `1` = SIM 2).

If the Android build can safely derive a stable SIM identity locally, it may additionally provide:

```json
{ "simIdentityHash": "<sha256 hex>" }
```

Only a SHA-256 hash is accepted. Do not send a raw ICCID or other unnecessary SIM identifier to BulkText cloud.

## Response

The response includes the current organization-selected binding:

```text
device_id
organization_id
server_time
bound_sim_id
bound_subscription_id
bound_slot_index
bound_carrier_name
binding_status
```

`binding_status` is one of:

- `unbound` — no SIM has been selected in the web app;
- `ready` — the selected subscription is currently present;
- `missing` — the selected subscription is no longer present.

## Critical no-fallback rule

If a bound SIM disappears, Android must **not** silently switch to another available subscription. The cloud retains the missing binding so the web dashboard can require an explicit re-bind.

Later sending/preflight phases must reject work unless:

```text
gateway status = active
AND binding_status = ready
AND the reported subscriptionId still exists
```

## Recommended report timing

Android integration should report inventory:

1. immediately after successful pairing;
2. on app/service start;
3. after SIM/subscription changes;
4. periodically while the gateway service is active;
5. before a future sending session begins.

A normal device authentication/heartbeat may continue to use `authenticate_gateway_device`; inventory reporting also refreshes `last_seen_at`.

## Web management RPCs

Authenticated organization members may view:

```text
list_gateway_device_dashboard(p_organization_id)
```

Only Owner/Admin may change SIM selection:

```text
bind_gateway_device_sim(p_organization_id, p_device_id, p_sim_id)
clear_gateway_device_sim_binding(p_organization_id, p_device_id)
```

Direct browser access to `gateway_device_sims` and `gateway_device_sim_bindings` remains disabled.
