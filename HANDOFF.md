# Development handoff — BulkText Web 0.7.0

## Current phase

0.7.0 implements **Device Dashboard & SIM Binding** on top of the 0.6 secure Android pairing trust boundary.

## Built in 0.7.0

- Forward migration: `20260930000230_device_dashboard_sim_binding.sql`.
- Gateway metadata columns for manufacturer/model, Android/app version, battery and inventory freshness.
- New tables:
  - `gateway_device_sims`
  - `gateway_device_sim_bindings`
- Device-authenticated inventory RPC: `report_gateway_device_inventory`.
- Tenant-scoped dashboard RPC: `list_gateway_device_dashboard`.
- Owner/Admin binding RPCs:
  - `bind_gateway_device_sim`
  - `clear_gateway_device_sim_binding`
- Devices UI upgraded from pairing-only inventory to health + SIM management.
- Explicit no-silent-fallback invariant: a missing selected SIM remains selected-but-missing until an Owner/Admin re-binds or clears it.
- Audit actions: `gateway.sim_bound`, `gateway.sim_unbound`.
- Android contract: `docs/ANDROID_DEVICE_INVENTORY_CONTRACT.md`.
- Local acceptance: `npm run test:device-dashboard-local`.
- 0.5/0.6 RBAC and pairing suites remain regression gates under schema 0.7.

## Important boundary

Web/Cloud 0.7 is not sufficient for physical-device completion. The Android gateway must implement the 0.6 pairing contract and then call `report_gateway_device_inventory` with its real detected subscription IDs/slots.

Do not enable campaign sending yet. Later preflight/queue phases must require an active gateway with `binding_status = ready`.

## Completion gate

```bash
npm run validate:local
npm audit
```

Expected integration markers:

```text
BulkText 0.7.0 RBAC REGRESSION PASS
BulkText 0.7.0 SECURE PAIRING REGRESSION PASS
BulkText 0.7.0 DEVICE DASHBOARD & SIM BINDING LOCAL PASS
```

Then perform Android physical-device validation:

- pair a real gateway;
- report real SIM 1/SIM 2 inventory;
- bind one SIM in Web;
- verify Android receives `binding_status=ready` and the exact subscription ID;
- remove/disable the bound SIM and verify status becomes `missing` with no fallback.

## Next roadmap

After 0.7 Web/Cloud + physical Android SIM reporting/binding is proven, proceed to **0.8 — Phone Number Foundation**. Do not jump to cloud queue or campaign sending.
