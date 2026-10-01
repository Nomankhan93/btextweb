# BulkText 0.12.1 — Individual Account Transition

## Goal

BulkText is now **individual-first** for the MVP.

User-facing flow:

```text
Sign up
→ personal account is provisioned automatically
→ pair Android phone
→ select SIM
→ upload recipients
→ validate / consent / suppression
→ compose personalized message
```

The user no longer creates or switches organizations and there is no Team/RBAC interface in the web app.

## Compatibility strategy

The existing `organizations` and `organization_members` tables are deliberately retained as an **internal tenant container**.

This avoids rewriting or moving the 0.6–0.12 data model, where existing records are already scoped by `organization_id`, including:

- gateway devices and pairing codes
- imports and staged rows
- recipient previews
- consent and suppression records
- eligibility snapshots
- message composer drafts
- audit logs

Every user now has one hidden personal workspace referenced by:

```text
profiles.personal_workspace_id
```

The internal membership remains:

```text
user → personal workspace → role=owner
```

The role is an implementation detail only; it is not shown in the product UI.

## Migration behavior

`20261001000060_individual_account_transition.sql`:

1. Adds `profiles.personal_workspace_id`.
2. Creates `ensure_personal_workspace_for_user(uuid)` as an internal provisioning helper.
3. Creates authenticated RPCs:
   - `ensure_personal_workspace()`
   - `get_my_personal_workspace()`
4. Replaces the auth-user trigger so new users automatically receive a personal workspace.
5. Backfills existing users.
6. Preserves current data by adopting the user's oldest existing Owner workspace when available.
7. Changes profile read RLS to self-only.
8. Removes direct authenticated access to organization/member/invitation tables.
9. Revokes authenticated access to organization creation, switching and team invitation/member-management RPCs.

## Removed web UX

Removed:

- Create Organization onboarding
- organization switcher
- invitation acceptance page
- Team navigation and Team page
- frontend RBAC helper/module
- organization identity editing in Settings
- role-based frontend gates

Replaced with:

- `WorkspaceProvider`
- `RequireWorkspace`
- automatic personal workspace provisioning
- account-only Settings

## Security invariants

The transition intentionally keeps the existing backend tenant boundaries. Existing device/import/compliance/composer RPCs still receive the hidden `organization_id` internally.

Important invariants:

- User A cannot access User B's personal workspace data.
- Profiles are self-readable only.
- Normal authenticated clients cannot directly query internal organization/member/invitation tables.
- Users cannot create additional organizations through the old RPC.
- Users cannot invite or manage team members through the old RPCs.
- Existing owner membership remains so 0.6–0.12 permission checks continue to work without weakening RLS.

## SMS business model unchanged

This patch does not change sending architecture.

Future sending still follows:

```text
BulkText Web
→ Cloud queue
→ paired Android phone
→ explicitly selected SIM
→ user's operator SMS package / balance
→ recipients
```

BulkText estimates SMS usage; the mobile operator determines actual package eligibility and charging.

## Validation

Run:

```bash
npm run validate
npm run test:account-local
npm run validate:local
npm audit
```

`test:account-local` verifies:

- auto-provisioned personal workspaces
- stable/idempotent workspace resolution
- internal Owner membership
- self-only profile RLS
- cross-user device isolation
- internal tenant tables hidden from normal clients
- organization/team RPCs disabled
- workspace repair adopts existing owned data instead of creating a second tenant
