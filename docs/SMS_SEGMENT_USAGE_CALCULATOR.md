# BulkText 0.13 — SMS Segment & Package Usage Calculator

## Purpose

0.13 estimates how many SMS units a fully rendered personalized message may consume before campaign confirmation or sending exists.

The estimate is calculated per recipient because personalization can change both message length and encoding.

```text
message template
→ render recipient variables
→ detect GSM-7 or Unicode
→ calculate SMS segments
→ aggregate recipient estimates
```

## Encoding model

BulkText uses `gsm7-ucs2-v1`.

### GSM-7

- single-part limit: 160 septets
- multipart limit: 153 septets per part
- GSM extension-table characters such as `^`, `{`, `}`, `\\`, `[`, `]`, `~`, `|`, `€` consume two septets

### Unicode / Urdu

- single-part limit: 70 UTF-16 units
- multipart limit: 67 UTF-16 units per part
- mixed English + Urdu is Unicode
- supplementary characters such as emoji are conservatively counted as two UTF-16 units

## Personalization

Each eligible row is rendered independently. Example:

```text
Ali   → Hello Ali       → GSM-7 → 1 SMS
علی   → Hello علی       → Unicode → 1 SMS
```

Campaign estimate:

```text
ready recipients:       2
estimated SMS units:    2
encoding:               Mixed
```

If personalization is incomplete, that recipient is excluded from the usage total and shown as blocked. BulkText does not silently replace a missing variable with an empty string.

## Long-message warning

BulkText displays a product warning when a personalized message reaches 4 or more estimated SMS segments. This is a review threshold, not a carrier restriction.

## Billing disclaimer

The calculator is an estimate only.

> BulkText estimates SMS segments from rendered message content. Package eligibility, actual deduction and telecom charges are determined by the user's mobile operator.

BulkText does not query or claim authoritative carrier package balance in 0.13.

## Explicitly not included in 0.13

- campaign confirmation
- selected-device/SIM execution snapshot
- queue jobs
- Android cloud-triggered sending
- scheduling
- delivery reports
- carrier balance lookup
- automatic SIM fallback

## Next phase

`0.14 — Campaign Confirmation Snapshot` will freeze recipients, rendered messages, calculated segment counts, device/SIM selection and eligibility evidence before execution can exist.
