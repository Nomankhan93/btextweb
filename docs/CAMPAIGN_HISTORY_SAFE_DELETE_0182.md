# BulkText 0.18.2 — Safe Campaign & History Delete

Adds individual campaign deletion and bulk **Delete safe history** cleanup.

Safety rules:

- never delete while Android has leased work;
- never delete downloaded work without a safely terminal attempt;
- never delete PREPARED/SUBMITTED/SENT or unresolved UNKNOWN attempts;
- never delete while recovery is pending;
- queued jobs that were never downloaded may be cancelled by deletion;
- deletion cascades the cloud dispatch/jobs/attempt/recovery history and campaign recipient snapshot, and writes an audit log;
- bulk cleanup skips unsafe campaigns rather than weakening the safety boundary.
