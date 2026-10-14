# BulkText Web 0.20.5 — Request Recovery, Auth & Adaptive Polling

Apply to the supplied clean 0.20.4 baseline. This patch adds bounded live-status reads, structured recovery errors, adaptive polling, and coalesced auth/workspace recovery.

- Live reads have a 15-second deadline and cancel outstanding sibling requests on failure.
- Transient failures back off with jitter (5–60 seconds); accessible Retry-After headers are respected. Manual/focus wakeups do not bypass cooldown.
- Campaign status polls every 5 seconds while active and 30 seconds while idle. Devices poll every 5 seconds during pairing and 15 seconds otherwise.
- Hidden/offline pages pause polling; reconnect resumes it. Last successful data stays visible with freshness and retry information.
- Auth validation is coalesced and bounded. Transient outages preserve the mounted account; definitive invalid-session errors require reauthentication. Workspace provisioning waits for valid auth.
- Mutating requests are not automatically replayed.

## Apply

Extract the patch ZIP, then run `bash /path/to/bulktext-web-0.20.5-patch/apply.sh /path/to/project`.
The installer verifies payloads and baseline hashes before writing. Conflicting edits stop installation. It backs up changed existing files under `.patch-backups/0.20.5-<timestamp>`. Existing `.env.example` is preserved; real environment files are untouched. Reapplying an already applied patch is safe.

Then run:
```bash
npm ci
npm run certify:0205
git diff --check
```

No new SQL migration. The existing 0.20.4 import migration must already be deployed for that baseline's import functionality. Backend contract remains 0.18.5. Deploy the frontend through your existing process after reviewing changes.

## Limits

Supabase suspension/outages can still prevent work. Client cancellation does not guarantee database rollback. This release covers six live-read RPCs plus workspace bootstrap, not every API. Import recovery, database hot-lock/query optimization, and Android polling remain separate follow-ups. Retry-After is usable only when exposed to the browser. Freshness timestamps are component-local.

See VALIDATION_0_20_5.md and HANDOFF_0_20_5.md for evidence and deployment checks.
