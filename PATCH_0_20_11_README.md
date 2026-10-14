# Patch 0.20.11 — Phone & SIM Readiness Control Center

Baseline: exact BulkText Web `0.20.10` release.

This patch turns Phone & SIM into a state-based sending-readiness screen while preserving the existing gateway/pairing/SIM safety contract.

Key changes:

- one truthful readiness summary instead of three competing status cards;
- fresh gateway + explicit present SIM required for green Ready;
- pairing promoted only when needed and demoted after a phone is active;
- active phones separated from revoked/history phones;
- technical metadata moved under Device details;
- compact SIM management with Selected / Use this SIM;
- branded SIM switch, unselect and disconnect confirmations;
- pairing URI/history and previous phones collapsed;
- compact SIM-safety explanation;
- Home reuses the same readiness derivation.

After apply run:

```bash
npm ci
npm run certify:02011
git diff --check
```

Backend contract: `0.18.5`. No SQL migration. No Android change.
