# Auth Screen Mobile Polish — Web 0.20.3

## Goal
Make Sign In and Create Account look and behave like two states of the same BulkText authentication system on mobile without changing authentication behavior.

## Layout contract
- Mobile auth cards are top-aligned using the same safe-area-aware shell.
- Cards use natural page scrolling instead of vertical centering.
- The mobile brand block is smaller and visually secondary to the auth task.
- Heading/body/form spacing is tightened while retaining comfortable touch targets.

## Form contract
- Auth inputs use a consistent white default surface and 56px height.
- Focus is shown with a visible brand-blue ring.
- Autofill uses a subtle light surface instead of a dominant browser tint where supported.
- Primary auth buttons use a 56px height and explicit busy labels.
- Inputs and password visibility controls are disabled while a submission is pending.

## Password visibility
`PasswordField` is presentation-only local state. It switches `type` between `password` and `text`, uses a non-submit button, exposes `Show password` / `Hide password`, and reports state through `aria-pressed`. The toggle has a 44×44px interaction target.

## Preserved behavior
AuthProvider remains the only owner of Supabase sign-in/signup behavior. Return-to handling, email-confirmation routing, password minimum length, error semantics, verification/recovery flows, backend contract 0.18.5 and all database policies remain unchanged.
