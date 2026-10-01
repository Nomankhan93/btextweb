# Patch 0.13.0 — SMS Segment & Package Usage Calculator

## Purpose

Add accurate pre-send SMS usage estimation to the existing 0.12.1 individual account workflow.

## Main changes

- GSM-7 vs Unicode detection
- GSM extension characters counted as two septets
- GSM-7 single/multipart limits: 160 / 153
- Unicode single/multipart limits: 70 / 67 UTF-16 units
- recipient-specific personalized segment calculation
- campaign estimated SMS-unit total
- min / max / average segments
- GSM-7 / Unicode recipient breakdown
- long-message warning at 4+ estimated segments
- missing-personalization recipients excluded from the estimate rather than silently substituted
- live estimate shown in Message Composer
- per-recipient encoding/segment badges in preview
- explicit operator-charging disclaimer

## Database change

New forward migration:

```text
20261001000070_sms_segment_usage_calculator.sql
```

It adds no campaign/send tables. It only advances/restores capability metadata.

## Explicitly not built

- campaign confirmation
- queue jobs
- Android cloud-triggered sending
- scheduling
- delivery reports
- carrier balance lookup
- automatic SIM switching

## Apply to the existing project

```bash
cd /home/noman/projects
rm -rf /home/noman/projects/bulktext-web-0.13.0-patch
unzip "/mnt/c/Users/noman/Downloads/bulktext-web-0.13.0-patch.zip" -d /home/noman/projects

bash /home/noman/projects/bulktext-web-0.13.0-patch/apply.sh \
  /home/noman/projects/bulktext-web-0.4.0
```

Then validate code:

```bash
cd /home/noman/projects/bulktext-web-0.4.0
nvm use || nvm install
npm install
npm run validate
npm audit
```

For the current Supabase Cloud setup:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

Only this migration should be pending:

```text
20261001000070_sms_segment_usage_calculator.sql
```

Then:

```bash
npx supabase db push
npx supabase migration list
```
