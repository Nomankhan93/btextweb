# BulkText Web 0.7.0 — Device Dashboard & SIM Binding

BulkText is a SIM-powered bulk SMS platform. The web/cloud control plane prepares tenant, gateway, SIM, campaign and later queue state; the Android gateway sends through the user's explicitly selected SIM and mobile package/balance.

0.7.0 extends the 0.6 secure device identity boundary with **gateway health/inventory reporting and explicit SIM binding**.

## 0.7.0 highlights

- Device dashboard shows paired gateway health and last inventory time.
- Android gateway can report manufacturer/model, Android version, app version and battery state using its device-scoped credential.
- Android can report current SIM subscriptions/slots without a web-user session.
- SIM inventory is isolated to the paired organization and exposed to the browser only through scoped RPCs.
- Owner/Admin can explicitly bind one currently-present SIM subscription to each active gateway.
- If the selected SIM disappears, the binding becomes `missing` instead of silently switching to another SIM.
- Missing subscriptions remain visible in history until a later report marks them present again or the organization explicitly re-binds.
- Binding and unbinding create organization audit events.
- Direct browser/anonymous access to SIM inventory/binding tables is disabled.
- `npm run test:device-dashboard-local` validates inventory reporting, tenant isolation, RBAC and no-silent-fallback behavior.

## Forward migration

0.7.0 adds only:

```text
supabase/migrations/20260930000230_device_dashboard_sim_binding.sql
```

Existing 0.5/0.6 migrations must remain unchanged.

## Local validation

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm install
npx supabase start
npx supabase migration up --local
npm run validate:local
npm audit
```

The local acceptance scripts intentionally refuse hosted Supabase targets.

## Hosted Supabase deployment

If the project is linked to the intended BulkText hosted Supabase project, review the target first and then apply the forward migration with the normal linked-project workflow, for example:

```bash
npx supabase projects list
npx supabase migration list
npx supabase db push
```

Do not use `db reset` on the hosted project.

## Security invariants

- Android identity remains `device_id + device credential`; no Owner/Admin user session is stored on the gateway.
- Raw gateway credentials remain hashed at rest by the 0.6 model.
- Device inventory reporting re-verifies the active, unexpired device credential before any write.
- Only organization members can view their gateway dashboard.
- Only Owner/Admin can pair/revoke a gateway or bind/unbind its SIM.
- A selected SIM that is absent becomes `missing`; BulkText never falls back to another subscription automatically.
- Raw ICCID is not required. An optional `simIdentityHash` may be sent only as a SHA-256 digest.
- Campaign sending is still disabled in this phase.

## Android integration

See:

- `docs/ANDROID_PAIRING_CONTRACT.md`
- `docs/ANDROID_DEVICE_INVENTORY_CONTRACT.md`

The Android gateway must consume these contracts in its Android-side integration before real-device 0.7 validation is complete.
