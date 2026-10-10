# BulkText handoff — Web 0.18.5

Web source patch implemented on the supplied 0.18.4 snapshot. Hosted rollout remains pending. Migration: 20261010000100_delivery_recovery_contract_hardening.sql.

Read docs/DELIVERY_RECOVERY_CONTRACT_0185.md, PATCH_README.md and VALIDATION_RESULTS.md first. They supersede historical patch status summaries.

Next Android 0.18.5 must consume v2 delivery evidence, preserve immutable observation IDs and no-resend resolution, durably track apply/ACK outcomes, isolate outboxes by device identity, quarantine terminal rejections and advance past permanently blocked READY jobs. Preserve the 0.18.4 safe-stop generation gate. No migration may automatically resend historical UNKNOWN.

Next Web 0.18.6 remains draft/session reliability, imports/segment safety and paginated attempt review. Those are not implemented by this patch.
