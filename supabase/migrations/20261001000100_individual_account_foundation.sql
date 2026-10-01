begin;

-- BulkText Fresh 0.5 Foundation — Individual Account + Hidden Personal Workspace
--
-- This clean baseline replaces the historical 0.4 Web/Cloud Foundation,
-- 0.5 Organization/RBAC, 0.5.1 RBAC stabilization, and the structural parts
-- of 0.12.1 Individual Account Transition.
--
-- Product model:
--   Auth User -> Hidden Personal Workspace -> organization_id-scoped data
--
-- The organizations table is intentionally retained as an INTERNAL tenant
-- container because downstream device/import/recipient/compliance/composer
-- schemas use organization_id. Organization creation/switching/invitations/
-- team-management RPCs are intentionally NOT created for the Individual MVP.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Application metadata + private upload bucket
-- ---------------------------------------------------------------------------

create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.app_meta is
  'Application metadata. Individual accounts use a hidden personal workspace tenant internally.';

alter table public.app_meta enable row level security;

insert into public.app_meta (key, value)
values (
  'schema',
  jsonb_build_object(
    'version', '0.5.0',
    'phase', 'individual_account_foundation',
    'tenant_model', 'hidden_personal_workspace',
    'organization_ui_enabled', false,
    'team_ui_enabled', false
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit)
values ('private-uploads', 'private-uploads', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- No storage.objects client policy is created here. The bucket remains private
-- and deny-by-default until a feature explicitly requires browser uploads.

-- ---------------------------------------------------------------------------
-- Identity + hidden tenant tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  personal_workspace_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  slug text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_personal_workspace_fk
  foreign key (personal_workspace_id)
  references public.organizations(id)
  on delete set null;

create unique index if not exists profiles_personal_workspace_unique
  on public.profiles(personal_workspace_id)
  where personal_workspace_id is not null;

-- Historical role values remain INTERNAL for forward compatibility. The fresh
-- Individual-First application provisions only an Owner membership and exposes
-- no authenticated role/team mutation API.
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','campaign_manager','analyst','billing')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_idx
  on public.organization_members(user_id);

create index if not exists audit_logs_org_created_idx
  on public.audit_logs(organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Generic timestamp helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Individual-First tenant helpers
--
-- Membership alone is NOT enough. For authenticated application calls the
-- requested organization_id must equal profiles.personal_workspace_id. This
-- prevents dormant/future secondary memberships from becoming usable during
-- the Individual-First MVP.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organization_members m
      on m.organization_id = p.personal_workspace_id
     and m.user_id = p.id
    where p.id = auth.uid()
      and p.personal_workspace_id = p_organization_id
  );
$$;

create or replace function public.org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.profiles p
  join public.organization_members m
    on m.organization_id = p.personal_workspace_id
   and m.user_id = p.id
  where p.id = auth.uid()
    and p.personal_workspace_id = p_organization_id
  limit 1;
$$;

create or replace function public.can_manage_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.org_role(p_organization_id) = 'owner', false);
$$;

-- ---------------------------------------------------------------------------
-- Personal workspace provisioning
-- ---------------------------------------------------------------------------

create or replace function public.ensure_personal_workspace_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_workspace_id uuid;
  v_display_name text;
  v_email text;
  v_workspace_name text;
  v_slug text;
  v_created boolean := false;
begin
  if p_user_id is null then
    raise exception 'User identifier is required' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Auth user not found' using errcode = 'P0002';
  end if;

  insert into public.profiles (id, email, display_name)
  select
    u.id,
    coalesce(u.email, ''),
    nullif(
      trim(
        coalesce(
          u.raw_user_meta_data ->> 'display_name',
          u.raw_user_meta_data ->> 'full_name',
          ''
        )
      ),
      ''
    )
  from auth.users u
  where u.id = p_user_id
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, public.profiles.display_name),
      updated_at = now();

  -- Serialize provisioning for this user. A concurrent auth update cannot
  -- create two hidden workspaces for the same account.
  select p.personal_workspace_id, p.display_name, p.email
    into v_workspace_id, v_display_name, v_email
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'User profile could not be provisioned' using errcode = 'P0002';
  end if;

  -- Fast path: valid personal workspace already exists. Repair the internal
  -- Owner membership if an administrative action removed or changed it.
  if v_workspace_id is not null
     and exists (
       select 1
       from public.organizations o
       where o.id = v_workspace_id
         and o.created_by = p_user_id
     ) then

    insert into public.organization_members (organization_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner')
    on conflict (organization_id, user_id)
    do update set role = 'owner';

    return v_workspace_id;
  end if;

  -- Repair path: adopt the user's oldest internally-owned workspace if the
  -- profile link was cleared. This is not a multi-workspace user capability.
  select o.id
    into v_workspace_id
  from public.organizations o
  join public.organization_members m
    on m.organization_id = o.id
  where o.created_by = p_user_id
    and m.user_id = p_user_id
    and m.role = 'owner'
  order by o.created_at asc, o.id asc
  limit 1;

  if v_workspace_id is null then
    v_workspace_name := nullif(trim(coalesce(v_display_name, '')), '');

    if v_workspace_name is null then
      v_workspace_name := nullif(split_part(coalesce(v_email, ''), '@', 1), '');
    end if;

    if v_workspace_name is null or char_length(v_workspace_name) < 2 then
      v_workspace_name := 'My BulkText';
    end if;

    v_workspace_name := left(v_workspace_name, 100);

    v_slug :=
      'personal-'
      || substr(replace(p_user_id::text, '-', ''), 1, 12)
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.organizations (name, slug, created_by)
    values (v_workspace_name, v_slug, p_user_id)
    returning id into v_workspace_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner');

    v_created := true;
  else
    insert into public.organization_members (organization_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner')
    on conflict (organization_id, user_id)
    do update set role = 'owner';
  end if;

  update public.profiles
  set personal_workspace_id = v_workspace_id,
      updated_at = now()
  where id = p_user_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_workspace_id,
    p_user_id,
    case
      when v_created then 'personal_workspace.created'
      else 'personal_workspace.adopted'
    end,
    'workspace',
    v_workspace_id::text,
    jsonb_build_object('individual_account', true)
  );

  return v_workspace_id;
end;
$$;

create or replace function public.ensure_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return public.ensure_personal_workspace_for_user(v_user_id);
end;
$$;

create or replace function public.get_my_personal_workspace()
returns table(
  workspace_id uuid,
  name text,
  slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_workspace_id := public.ensure_personal_workspace_for_user(v_user_id);

  return query
  select o.id, o.name, o.slug
  from public.organizations o
  where o.id = v_workspace_id
    and o.created_by = v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth user provisioning
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  perform public.ensure_personal_workspace_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_auth_user();

-- Safe backfill in case test auth users already exist when this migration runs.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select u.id from auth.users u loop
    perform public.ensure_personal_workspace_for_user(v_user_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Normal authenticated clients get no direct access to hidden tenant internals.
revoke all on table public.app_meta from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.organization_members from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Service-role administration/tests.
grant all on table public.app_meta to service_role;
grant all on table public.profiles to service_role;
grant all on table public.organizations to service_role;
grant all on table public.organization_members to service_role;
grant all on table public.audit_logs to service_role;

-- PostgreSQL functions default EXECUTE to PUBLIC. Close every security-sensitive
-- helper first, then expose only the intended interface.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.org_role(uuid) from public, anon;
revoke all on function public.can_manage_org(uuid) from public, anon;
revoke all on function public.ensure_personal_workspace_for_user(uuid) from public, anon, authenticated;
revoke all on function public.ensure_personal_workspace() from public, anon;
revoke all on function public.get_my_personal_workspace() from public, anon;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.org_role(uuid) to authenticated, service_role;
grant execute on function public.can_manage_org(uuid) to authenticated, service_role;
grant execute on function public.ensure_personal_workspace_for_user(uuid) to service_role;
grant execute on function public.ensure_personal_workspace() to authenticated, service_role;
grant execute on function public.get_my_personal_workspace() to authenticated, service_role;

commit;
