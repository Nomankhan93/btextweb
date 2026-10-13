# Handoff — Web 0.20.2

Frontend: `0.20.2`
Backend: `0.18.5`
Migration: none

## Completed scope
- compact conversion-led hero;
- product proof promoted ahead of explanatory sections;
- compact workflow and features;
- three-point comparison;
- improved Android gateway mobile flow/contrast;
- accessible FAQ accordion;
- mobile menu Escape/focus/scroll behavior;
- 0.20.1 Install App/update regression preservation;
- dedicated 0.20.2 source/runtime/certification gates.

## Post-deploy mobile smoke
Verify in Chrome mobile browser at representative widths around 320, 360, 390 and 412px:
1. no horizontal overflow;
2. hero/primary CTA are immediately visible;
3. dashboard proof begins significantly earlier than the prior landing;
4. hamburger menu opens/closes cleanly and Install App appears only when genuinely installable;
5. FAQ controls expand/collapse correctly;
6. Android dark section text remains readable;
7. signup/sign-in links still route correctly.

Do not run `supabase db push` for Web 0.20.2.
