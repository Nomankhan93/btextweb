# BulkText Web 0.9.0 — Validation Matrix

## Artifact build checks

- [x] Forward migration added; previous migration files unchanged
- [x] No new runtime NPM dependency required for CSV/XLSX parsing
- [x] Existing `@supabase/supabase-js` dependency is preserved by the installer
- [x] CSV parser/unit coverage added
- [x] XLSX stored-ZIP workbook fixture/unit coverage added
- [x] Column auto-mapping/preview/dedup-flag unit coverage added
- [x] Tenant/RPC local integration script added
- [x] Import tables are RLS protected and direct authenticated writes are not granted
- [x] 5 MB / 5,000 row / 100 column phase limits documented
- [x] Invalid and duplicate rows are retained for later 0.10 review rather than silently discarded

## Final environment gates

Run in the target WSL project:

```bash
npm run validate
npm audit
```

Run against disposable/local BulkText Supabase after the migration is applied:

```bash
npm run validate:local
```

Cloud deployment remains an explicit user action after confirming the linked Supabase project.
