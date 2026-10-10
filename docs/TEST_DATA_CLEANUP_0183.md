# BulkText 0.18.3 — Test Data Cleanup / Campaign Purge

> **Historical 0.18.3 note:** Web 0.18.4 removes these purge RPCs from the effective schema and removes the production UI/API entry point. Do not use this workflow in production. The historical migration remains unchanged for forward-only migration integrity.


This development-only cleanup is intentionally stronger than normal campaign deletion.

## Cloud purge removes

- campaign confirmations and frozen recipients
- send authorizations associated with those campaigns
- durable dispatches and cloud jobs
- queue events
- message attempts and per-part callback state
- callback events
- recovery requests

## Preserved

- Supabase Auth user/account
- personal workspace
- Android gateway device pairing/credential rows
- SIM inventory and authoritative SIM binding
- consent and suppression history
- imports / preview data
- message drafts
- audit logs

The RPC requires an authenticated workspace member and the exact confirmation phrase `PURGE TEST CAMPAIGNS`.

## Android local queue

Android has an independent durable SQLite queue. Cloud purge cannot erase that device-local database. For the debug test APK, run `scripts/reset-android-test-queue.ps1` after the cloud purge. It deletes only `cloud_queue.db*` via `adb run-as`; it does **not** clear app data, secure pairing preferences, installation ID, background-gateway preferences, or `gateway.db`.

Do not start a fresh campaign between the cloud purge and the Android local-queue reset.
