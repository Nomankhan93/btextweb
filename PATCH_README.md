# Current Patch — Web 0.20.2

`0.20.2 — Landing Page Conversion & Mobile UX` improves the signed-out public landing page without changing BulkText product workflows or backend contracts.

## Included
- compact mobile hero and clearer single value proposition;
- product/dashboard proof moved before workflow explanation;
- three-item value strip;
- compact four-step workflow;
- lighter six-feature presentation without oversized mobile cards;
- three-differentiator BulkText comparison;
- higher-contrast, smaller Android gateway section with vertical mobile flow;
- accessible FAQ accordion;
- mobile menu Escape close, focus return, outside dismissal and scroll lock;
- explicit regression coverage for the `0.20.1` conditional Install App/update experience;
- narrow-screen CSS guard down to 320px-class devices.

## Not included
No Supabase migration, auth change, campaign/send behavior change, Android gateway protocol change, delivery/recovery state change, analytics stack, pricing/free-tier claim, or service-worker fetch-strategy change.

## Validate
```bash
nvm use 24.21.0
npm ci
npm run certify:0202
git diff --check
./scripts/release-package.sh
```
