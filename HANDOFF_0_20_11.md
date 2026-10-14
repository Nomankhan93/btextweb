# BulkText Web 0.20.11 — Handoff

## Scope

Phone & SIM Readiness Control Center only.

### Preserve

- one-use secure pairing and expiry/revoke behavior;
- explicit SIM binding; no automatic SIM fallback;
- stale/offline gateway safety;
- confirmed-campaign exact phone/SIM snapshot semantics;
- 0.20.7 confirmation/send boundary;
- 0.20.10 delivery/recovery semantics;
- backend contract `0.18.5`.

### New UI contract

- `gatewayWorkspaceReadiness()` is the shared source for Home/Phone & SIM readiness;
- Ready requires active + recent gateway + present selected SIM;
- paired and online are distinct concepts;
- no-phone state makes pairing primary;
- connected state demotes pairing to Pair another phone;
- revoked phones are Previous phones, not connected phones;
- Android/API/build/credential/device ID are progressive disclosure;
- `Bound` is replaced by Selected;
- `Clear SIM` is replaced by Unselect SIM;
- SIM switch, unselect and disconnect use branded confirmations;
- confirmed campaigns retain their locked phone/SIM identity and still require exact-SIM match at send time.

No migration and no Android change.
