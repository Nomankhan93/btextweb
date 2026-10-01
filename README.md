# BulkText Web

BulkText is a SIM-powered bulk SMS platform where the customer uses their own Android gateway and mobile SIM/package while BulkText provides campaign workflow, cloud coordination, controls and reporting.

## Current version

**0.9.0 — Excel / CSV Import**

Current web/cloud capabilities include authentication and tenant RBAC, secure Android pairing, device/SIM inventory and explicit SIM binding, Pakistan mobile-number normalization, and tenant-scoped CSV/XLSX import staging.

Import staging is intentionally separate from recipient authorization. No import row can be sent in 0.9.

## Local validation

```bash
npm install
npm run validate
```

With BulkText local Supabase running on API port `56321` and all migrations applied:

```bash
npm run validate:local
```

0.9 adds:

```bash
npm run test:import-local
```

See `docs/EXCEL_CSV_IMPORT.md` for the import trust boundary and supported formats.
