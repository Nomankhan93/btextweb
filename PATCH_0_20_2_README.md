# BulkText Web 0.20.2 — Landing Page Conversion & Mobile UX

## Baseline
Built on certified Web `0.20.1 — PWA Install & Update Experience`.

Frontend: `0.20.2`
Backend contract: `0.18.5`
Database migration: **none**
Android change: **none**

## Scope
This patch is restricted to the public landing presentation, responsive behavior, public-menu interaction/accessibility, release markers and landing-focused regression coverage.

The redesign shortens the mobile experience, makes the product proof visible earlier, removes repetitive sections, reduces oversized card treatment, and keeps the Android gateway differentiator clear without changing how BulkText actually sends or tracks messages.

## Frozen behavior
Auth, Supabase, campaign creation, recipient import, exact SIM authorization, durable queue behavior, delivery/recovery states, Android protocol, service-worker fetch strategy and `0.20.1` install/update lifecycle remain unchanged.

## Certification
Use `npm run certify:0202`, then `git diff --check` and `./scripts/release-package.sh`.
