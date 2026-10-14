# Handoff — Web 0.20.5

The reusable recovery layer is `src/lib/requestRecovery.ts`; the scheduler is `src/lib/useAdaptivePoll.ts`. Live campaign/device hooks retain the previous successful batch when refresh fails. `SyncFreshness` displays freshness outside live announcements. Auth and workspace providers coalesce validation/bootstrap work and distinguish temporary failure from a revoked session.

Release and service-worker markers are 0.20.5. Historical source-check filenames remain intact; release assertions were updated. A placeholder-only `.env.example` was restored because the supplied clean ZIP omitted it.

Before deployment, apply to your 0.20.4 working tree and run `npm run certify:0205`. After deployment, verify login, campaign/device freshness, hidden-tab pause, offline/reconnect, and recovery from a temporary server failure. Confirm existing sending behavior and controlled PWA update on an actual gateway device. Never resend a message merely because a status read timed out.

Rollback: retain your previous deployment. For source rollback, use the installer backup's `backup-manifest.json` to restore backed-up paths and remove only paths recorded as newly created, after checking for later edits. Reinstall dependencies after restoring package files. No database rollback is required for this patch.

Follow-ups: staged-import recovery; database contention and inventory-query improvements; Android polling audit. This patch does not resolve a provider-wide incident or prove its root cause.
