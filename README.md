# BulkText Web 0.15.0

BulkText is an **individual-first SIM-powered SMS platform**.

Current user flow:

```text
Sign up
→ hidden personal workspace prepared automatically
→ pair Android phone
→ explicitly select SIM
→ upload recipients
→ validate numbers
→ consent / suppression check
→ compose personalized message
→ estimate SMS units
→ review & confirm immutable campaign
→ run gateway preflight
→ issue short-lived send authorization
```

## 0.15 capability

0.15 adds **Gateway Preflight & Send Authorization** after the 0.14 immutable campaign snapshot.

The server now verifies current send-safety conditions immediately before authorization:

- confirmed campaign snapshot integrity;
- exact confirmed Android device still active and recently seen;
- fresh SIM inventory;
- valid current gateway credential;
- exact Web-bound SIM still selected and present;
- subscription ID unchanged;
- SIM slot unchanged;
- SIM identity unchanged;
- current consent still valid;
- current suppression still clear.

A successful authorization is server-created, auditable, explicitly revocable and expires after 5 minutes.

## Exact-SIM rule

BulkText never silently switches to another active SIM. Missing, rebound, replaced or unverifiable confirmed SIM identity blocks authorization.

## Still disabled

0.15 does **not** create the durable cloud queue and does **not** send SMS.

```text
campaign_send_enabled=false
queue_enabled=false
```

The next build is `0.16 — Durable Cloud Queue`, which must atomically revalidate/consume a fresh authorization before creating jobs.

## Validation

```bash
npm run validate
npm audit
npx supabase migration list
npx supabase db push --dry-run
```

Expected new pending migration only:

```text
20261001000310_gateway_preflight_send_authorization.sql
```

After manual dry-run review:

```bash
npx supabase db push
npx supabase migration list
npx supabase db lint --linked
```

Do not edit already-applied migrations `00300` or `00305`.

## 0.16 — Durable Cloud Queue

BulkText 0.16 adds the durable cloud queue between short-lived send authorization and the future Android job client. Queue creation consumes/revalidates a fresh authorization, freezes the exact Web-selected device/SIM identity, creates immutable jobs from `campaign_recipients`, and supports credential-authenticated lease/download/ACK. No SMS is submitted or sent in this phase. See `docs/DURABLE_CLOUD_QUEUE.md`.
