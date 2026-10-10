# Validation — Web 0.18.5

- 39 SQL contract scenarios PASS using PGlite 0.5.8 with pgcrypto and the actual PL/pgSQL migration chain. Includes a 0.18.4 historical-data upgrade and final schema/grant assertions.
- 18 Vitest files / 84 tests PASS, including 5 new contract presentation tests.
- Preflight PASS; referenced-project TypeScript check PASS; production build PASS.
- Source release path, secret-value scan and checksum verification PASS. Existing Vite main-bundle size warning remains (~680 kB uncompressed); not a correctness failure.

SQL scenarios cover legacy delivery, verified GSM/CDMA reports, multipart aggregation, immutable replay/conflicts, preserved operator resolution, late ACK and replay, >25 stale recovery rows, wrong/expired/revoked credentials, cross-workspace access and RLS, blocked recipient/segment checks, exact-SIM queue fairness, tombstones and guarded bulk deletion.

No hosted Supabase migration, PostgREST integration, concurrent multi-session stress test, browser visual test or real SMS/device test was executed. PGlite tests use minimal auth.users/auth.uid/storage scaffolding for Supabase-owned infrastructure and real project tables/functions/roles. They do not require a local Supabase stack or read .env.

Package installer checks and apply instructions are supplied in the patch ZIP. See docs/DELIVERY_RECOVERY_CONTRACT_0185.md for compatibility and remaining Android consumer work.
