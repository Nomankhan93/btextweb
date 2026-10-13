# Validation — Web 0.20.4

Web `0.20.4` adds recipient-import reliability/scale gates while retaining the certified `0.20.3-r1` production-routing/PWA baseline and backend send contract `0.18.5`.

Primary web certification: `npm run certify:0204`.

Because this release introduces a database migration and new staged-import RPCs, database acceptance is a separate mandatory gate: apply `20261013000100_recipient_import_reliability_scale.sql` locally and run `npm run test:import-scale-local-0204` before any hosted database push.

Production deployment order is database first, frontend second. After deployment, smoke-test CSV, XLSX, a >5,000-row import, cancellation cleanup, direct React routes, and the controlled PWA update path.
