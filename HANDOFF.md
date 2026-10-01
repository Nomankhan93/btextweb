# BulkText 0.12.1 Handoff

## Current state

BulkText has pivoted from organization/team-first UX to an **individual-first account model**.

Current user journey:

```text
Sign up
→ account automatically prepared
→ pair Android phone
→ select SIM
→ upload recipients
→ validate / consent / suppression
→ compose personalized message
```

The existing organization schema is retained only as a hidden tenant container to preserve all already-built 0.6–0.12 data and RLS/RPC behavior.

## Important implementation detail

Do **not** drop `organizations`, `organization_members`, or `organization_id` fields in later patches unless a separate, fully tested ownership migration is intentionally designed.

Use `useWorkspace()` in frontend pages. The returned `workspace.id` is passed to existing backend RPC parameters named `p_organization_id`.

Do not reintroduce:

- organization onboarding
- organization switching
- team invitations
- role management UI

unless a future Organizations feature is explicitly started.

## Next development

After local validation passes:

```text
0.13 SMS Segment & Usage Calculator
0.14 Campaign Confirmation Snapshot
0.15 Gateway Preflight
0.16 Durable Cloud Queue
0.17 Android Cloud Sending
```

Actual SMS sending remains Android-only and must use the user's explicitly selected SIM. The carrier determines actual package/balance charging.
