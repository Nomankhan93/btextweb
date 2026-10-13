# Landing Page Conversion & Mobile UX — Web 0.20.2

## Goal
Make the public landing page faster to understand and materially shorter on mobile while preserving the approved BulkText brand and factual product claims.

## Information architecture
Header → Hero → Product proof → Key advantages → How it works → Features → Why BulkText → Android Gateway → FAQ → Final CTA → Footer.

The former standalone product-visibility/live-status section is removed; its useful delivery proof is folded into the dashboard preview.

## Hero and product proof
The primary message is **Business SMS, sent from your own SIM.** Supporting copy explains web campaign management, the paired Android phone and exact SIM choice without competing with the headline.

The dashboard proof tells one campaign story: `1,284 recipients → 1,271 sent → 1,243 delivered`, plus `SIM 1 · Online`. Delivery evidence remains explicitly dependent on device/network callbacks.

## Mobile density
- hero H1 targets roughly 40–44px at common 360–390px widths;
- section spacing is reduced;
- workflow items use compact number + copy rows;
- features use icon + heading + short description instead of large bordered cards;
- the Android phone illustration is smaller;
- comparison is limited to infrastructure, gateway cost model and routing control;
- 320–360px layouts have an explicit no-overflow/narrow-screen guard.

## Accessibility
- interactive controls preserve at least 44px-class targets;
- public-menu Escape close returns focus to the hamburger trigger;
- background scrolling is disabled while the mobile menu is open;
- FAQ uses buttons with `aria-expanded`, `aria-controls` and labelled answer regions;
- visible `:focus-visible` treatment is retained;
- dark Android supporting copy is raised to stronger contrast.

## Performance boundaries
No animation library or analytics dependency is added. Existing icon assets are reused. The below-the-fold Android icon declares dimensions and lazy loading. The service-worker cache version moves to `0.20.2` only so the new static UI is delivered to installed clients.

## Preserved contracts
- backend contract `0.18.5`;
- exact phone/SIM routing and no silent fallback;
- delivery/recovery semantics;
- auth/session/workspace behavior;
- campaign and recipient behavior;
- `0.20.1` conditional Install App prompt/menu behavior and explicit update activation;
- PWA/offline fetch strategy;
- no database migration.
