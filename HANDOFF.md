# BulkText 0.13.0 Handoff

## Current state

BulkText is an **individual-first SIM-powered SMS product**.

Current workflow:

```text
Sign up
→ personal workspace prepared automatically
→ pair Android phone
→ select SIM
→ upload recipients
→ validate / consent / suppression
→ compose personalized message
→ estimate GSM-7 / Unicode SMS usage
```

No campaign can be confirmed or sent yet.

## 0.13 implementation

`src/lib/smsSegments.ts` is the deterministic calculation layer.

It supports:

- GSM-7 detection
- GSM extension-table characters at two septets
- 160 / 153 GSM-7 limits
- Unicode/Urdu estimation at 70 / 67 UTF-16 units
- mixed English + Urdu
- supplementary Unicode such as emoji
- personalized recipient-by-recipient calculation
- campaign total / min / max / average segments
- long-message review warning
- exclusion of incomplete personalization from package-usage totals

The composer displays these estimates live. A draft still cannot create queue jobs or contact the Android gateway.

## Database note

`20261001000220_sms_segment_usage_calculator.sql` adds no campaign tables. It advances capability metadata and restores the full metadata object after the 0.12.1 individual-account transition.

The hidden `organization_id` tenant architecture remains internal. Do not drop it.

## Sending rule remains authoritative

Actual SMS will later be sent by:

```text
User's paired Android phone
→ explicitly selected SIM
→ user's package / balance
```

No automatic SIM fallback. Carrier charging remains authoritative.

## Next development

```text
0.14 Campaign Confirmation Snapshot
0.15 Gateway Preflight
0.16 Durable Cloud Queue
0.17 Android Cloud Sending
```
