# BulkText 0.8 — Phone Number Foundation

## Purpose

0.8 establishes one deterministic representation for recipient phone numbers before Excel/CSV import, duplicate removal, suppression, message composition, queueing or Android delivery.

## Current country scope

The first production rule set is intentionally narrow:

- Country: Pakistan (`PK`)
- Number type: mobile
- Canonical storage/transmission shape: E.164 `+923xxxxxxxxx`
- Normalization version: `pk-mobile-v1`

Examples accepted by the normalizer:

```text
03001234567
3001234567
923001234567
+923001234567
00923001234567
+92 300 123 4567
0300-123-4567
```

All valid examples normalize to:

```text
+923001234567
```

## Deliberate non-goals

0.8 does not:

- persist contacts;
- import Excel/CSV files;
- remove duplicates from a campaign;
- enforce consent/suppression;
- infer the current mobile operator from the prefix;
- support international recipient countries;
- send messages.

Mobile number portability means a prefix must not be treated as authoritative carrier identity. SIM/operator state is handled separately by the Android gateway/device layers.

## Shared contract

The browser utility is `src/lib/phoneNumbers.ts`.

The database RPC is:

```text
normalize_phone_number(p_raw text, p_default_country text default 'PK')
```

Both layers use the same status vocabulary:

```text
valid
empty
invalid_characters
invalid_length
unsupported_country
unsupported_number_type
```

Later import/validation phases should normalize first, then use `normalized_e164` as the stable deduplication/suppression key.
