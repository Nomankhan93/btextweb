# BulkText 0.18.1 — Callback / Retry Safety Stabilization

## Why this patch exists

Real-device acceptance on the Android gateway produced a safety-critical contradiction: recipients received the SMS while Android/cloud recorded all SENT callbacks as failures. The 0.18.0 rule therefore offered an explicit "Safe retry" even though the external SMS effect had already happened.

0.18.1 treats this evidence conservatively.

## New invariant

Once `SmsManager` has been invoked, a non-success, missing, mixed, or conflicting SENT callback is not proof that zero SMS parts left the device.

Therefore:

- complete SENT success may establish `SENT`;
- complete delivery callbacks may establish `DELIVERED`;
- any post-SmsManager SENT failure outcome is `UNKNOWN`;
- callback-derived `safe_retry_eligible` is disabled;
- UNKNOWN can only continue with **without resending**;
- no automatic or Web-authorized resend is created from SENT callback failure.

## Existing 0.18.0 data

Migration `20261006000180_callback_retry_safety_stabilization.sql` reclassifies existing callback-derived `FAILED` attempts to `UNKNOWN`, clears retry eligibility, and consumes unprocessed `safe_retry` recovery requests.

Attempt/event history remains immutable and is not deleted.

## Web UX

The Campaign detail page no longer exposes the callback-derived Safe retry button or green Safe retry badge. Prepared and Submitted are shown together with explicit wording that neither means carrier SENT.

## Follow-up Android work

This Web/Cloud patch is a defense-in-depth safety fix. Android should still be updated to persist raw SENT/DELIVERED result codes and classify device/carrier-specific callback behavior for diagnostics. That Android work must not re-enable resend unless a future mechanism can positively prove that `SmsManager` was never invoked / no external effect occurred.
