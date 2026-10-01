# BulkText 0.6.0 — Android Pairing Contract

This document defines the Web/Cloud protocol that the Android Gateway must consume. It intentionally does **not** give the Android device a Supabase user login session.

## 1. Pairing flow

1. Organization Owner/Admin opens **Devices** in BulkText Web.
2. Web calls `create_gateway_pairing_code(organization_id)`.
3. Cloud returns a random 12-character code, a `bulktext://pair?code=...` URI and a 10-minute expiry.
4. Android scans the QR (the QR contains the 12-character code) or accepts manual code entry.
5. Android creates/persists an installation identifier that is stable for that app installation. Recommended: random UUID generated once and stored in Android encrypted preferences/keystore-backed storage.
6. Android calls `claim_gateway_pairing(code, device_name, installation_id)` using the public Supabase anon/publishable key, **not** a user session.
7. Cloud atomically consumes the one-use code, creates the gateway device and returns:
   - `device_id`
   - `organization_id`
   - `organization_name`
   - `device_name`
   - `credential`
   - `credential_version`
   - `credential_expires_at`
8. Android stores `device_id` and raw `credential` in Android secure storage. The credential is returned once; the cloud stores only its SHA-256 hash.

## 2. Authentication

Before later queue/sync APIs are added, Android can verify its credential with:

```text
authenticate_gateway_device(device_id, credential)
```

The function returns only the paired device/organization scope and credential metadata. It also updates gateway last-seen state.

## 3. Credential rotation

Android can rotate its own credential with:

```text
rotate_gateway_device_credential(device_id, current_credential)
```

On success:

- old credential is revoked immediately;
- credential version increments;
- new raw credential is returned once;
- Android must replace the stored credential atomically.

Current credential lifetime: **90 days**.

## 4. Revocation / unpair

Organization Owner/Admin can revoke the gateway from BulkText Web. Revocation:

- marks the device `revoked`;
- revokes all active credential records;
- causes subsequent device-auth calls to fail immediately.

Android should interpret an authorization failure for a previously valid device as **unpaired/revoked** and require a fresh pairing code rather than falling back to a user login.

## 5. Security requirements for Android integration

- Never embed the Supabase service-role/secret key in the APK.
- Never store an Owner/Admin access token as the gateway identity.
- Store the device credential using Android keystore-backed secure storage.
- Do not log pairing codes or raw device credentials.
- Clear the stored device credential on explicit unpair or confirmed revocation.
- Do not silently pair to a different organization.
- The same active installation identifier cannot be paired twice at the same time.
- Pairing codes are one-use and expire after 10 minutes.

## 6. Deferred to later queue phases

0.6 establishes device identity only. It does **not** yet authorize campaign queue reads, sending jobs, delivery status uploads, or heartbeat payloads beyond the pairing authentication probe. Those APIs must consume the same scoped device credential in later roadmap phases.
