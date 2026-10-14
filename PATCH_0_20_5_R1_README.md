# BulkText Web 0.20.5-r1 — Auth Response Body Recovery

Corrects a regression introduced in 0.20.5: the auth fetch deadline aborted the transport after headers arrived, before Supabase could consume its body. Valid HTTP 200 login responses could therefore fail with “signal is aborted without reason”.

The auth wrapper now reads the complete response body inside the deadline and hands the SDK an independent Response. HTTP status, headers and error bodies are preserved; stalled bodies still time out; requests are never automatically replayed.

Evidence from the supplied logs: logout returned 204; three subsequent password-token requests returned 200. Two PostgreSQL 22023 errors concern the existing campaign deletion safeguard while execution/reconciliation is in progress, separate from login.

Regression tests reproduce delayed-body failure on the original implementation, and cover successful bodies, error bodies, stalled bodies and sign-in → sign-out → sign-in using the actual Supabase auth client.

Apply on 0.20.5 with `bash apply.sh /path/to/project`, then `npm ci && npm run certify:0205 && git diff --check`. Installer verifies changed baseline hashes and creates backups. No new migration or Android changes. Package and service-worker versions are 0.20.5-r1 so the installed PWA receives a fresh shell.

Validation: full certification passed (preflight, type checking, 220 tests / 43 files, production build). Actual phone/browser deployment remains to be verified after deploying this correction. Earlier mocked auth tests did not model the gap between response headers and streamed response body; the new tests cover it.

After frontend deployment, accept the PWA update, reopen the app and check login → logout → login. Do not delete drafts or reset application storage as the first workaround.
