# Patch 0.12.1 — Individual Account Transition

## Purpose

Convert the existing multi-organization web experience into an individual-first MVP **without destructively rewriting the working 0.6–0.12 backend data model**.

## Main changes

- auto-create/adopt one hidden personal workspace per authenticated user
- existing owned workspace is adopted so current data remains in place
- remove Create Organization onboarding
- remove organization switcher
- remove Team/invitation UI and routes
- replace `OrganizationProvider` with `WorkspaceProvider`
- remove frontend RBAC gates
- simplify Settings to account profile only
- make profiles self-readable only
- hide internal organization/member/invitation tables from normal web clients
- revoke old organization/team RPCs for authenticated users
- update local regression scripts to use `get_my_personal_workspace()`
- add `test:account-local`

## Intentionally retained

These remain in PostgreSQL for compatibility and possible future organization support:

```text
organizations
organization_members
organization_invitations
organization_id foreign keys
is_org_member()
org_role()
can_manage_org()
```

They are implementation details, not user-facing MVP concepts.

## Apply

Use the supplied patch ZIP and `apply.sh`. The installer stores backups **outside the target repo** under the target's parent directory so Vitest does not discover backup tests.

Then run:

```bash
cd /home/noman/projects/bulktext-web-0.4.0
npm install
npx supabase start
npx supabase migration up --local
npm run validate:local
npm audit
```

Expected schema metadata after migration:

```json
{
  "version": "0.12.1",
  "phase": "individual_account_transition",
  "tenant_model": "hidden_personal_workspace"
}
```
