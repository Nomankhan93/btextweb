# BulkText local Supabase

This project intentionally uses a unique port range so it can run alongside the user's existing local Supabase projects.

```text
API       56321
DB        56322
Studio    56323
Mailpit   56324
Shadow DB 56320
```

Start and apply migrations:

```bash
npx supabase start
npx supabase migration up --local
npx supabase status
```

Migrations:

1. `20260930000100_web_cloud_foundation.sql`
2. `20260930000200_auth_organizations_rbac.sql`

Never place a service-role key in the Vite client environment.
