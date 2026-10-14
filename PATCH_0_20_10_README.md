# Patch 0.20.10 — Campaign Delivery Experience

Baseline: exact BulkText Web `0.20.9` release.

This patch adds a truthful live campaign-status experience based on existing durable queue and delivery-attempt data.

Key changes:

- live processing progress;
- Android receipt / known SENT / DELIVERED stages;
- active/attention/completed state presentation;
- UNKNOWN preserved as ambiguous and non-retryable;
- branded skip-without-resend recovery confirmation;
- compact callback breakdown;
- masked diagnostic phone numbers;
- 0.20.10 release/version/service-worker markers.

After apply run:

```bash
npm ci
npm run certify:02010
git diff --check
```

Backend contract: `0.18.5`. No SQL migration. No Android change.
