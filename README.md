# BulkText Web 0.12.1

BulkText is an **individual-first SIM-powered SMS platform**.

The web app prepares recipients and messages; a paired Android gateway will later send SMS through the user's explicitly selected SIM. SMS package eligibility and actual carrier charging are determined by the mobile operator.

## Current product scope

Built through 0.12 plus the 0.12.1 individual-account transition:

- Supabase authentication and account recovery
- automatic personal workspace provisioning
- secure Android pairing foundation
- device dashboard and explicit SIM binding
- Pakistan mobile-number normalization
- CSV/XLSX import
- recipient validation and immutable preview snapshots
- consent / suppression evidence and eligibility snapshots
- message composer and personalization preview

Not built yet:

- SMS segment/usage calculator
- campaign confirmation
- gateway preflight
- durable cloud queue
- cloud-triggered Android sending
- scheduling
- campaign reports

## Individual account architecture

The UI has no organizations, teams, invitations or role management.

For migration safety, the backend still uses a hidden personal workspace as the internal tenant container:

```text
Auth user
→ profiles.personal_workspace_id
→ hidden organizations row
→ hidden Owner membership
→ existing organization_id-scoped 0.6–0.12 data
```

See `docs/INDIVIDUAL_ACCOUNT_TRANSITION.md`.

## Local ports

BulkText local Supabase uses:

```text
API      56321
DB       56322
Studio   56323
Mailpit  56324
```

This keeps it separate from the user's other local Supabase projects.

## Run

```bash
nvm use || nvm install
npm install
cp .env.example .env.local
npx supabase start
npx supabase migration up --local
npm run validate:local
npm audit
npm run dev
```

## Next planned feature

After 0.12.1 validates cleanly, continue with **0.13 — SMS Segment & Usage Calculator**.
