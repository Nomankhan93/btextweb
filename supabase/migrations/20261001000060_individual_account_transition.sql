begin;

-- BulkText 0.12.1 — Individual Account Transition
--
-- Product-facing organizations/teams are retired for the individual-first MVP,
-- but the organization table remains the internal tenant container so 0.6–0.12
-- device/import/recipient/compliance/composer data does not need a destructive
-- ownership rewrite. Every authenticated user gets exactly one hidden personal
-- workspace and remains its Owner internally.

alter table public.profiles
  add column if not exists personal_workspace_id uuid
  references public.organizations(id) on delete set null;

create unique index if not exists profiles_personal_workspace_unique
  on public.profiles(personal_workspace_id)
  where personal_workspace_id is not null;

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

  -- Ensure the profile exists even for older auth fixtures or repaired users.
  insert into public.profiles (id, email, display_name)
  select
    u.id,
    coalesce(u.email, ''),
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', '')), '')
  from auth.users u
  where u.id = p_user_id
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, public.profiles.display_name),
      updated_at = now();

  select p.personal_workspace_id, p.display_name, p.email
    into v_workspace_id, v_display_name, v_email
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'User profile could not be provisioned' using errcode = 'P0002';
  end if;

  -- A stored personal workspace is valid only when the same user is its Owner.
  if v_workspace_id is not null and exists (
    select 1
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id
    where o.id = v_workspace_id
      and m.user_id = p_user_id
      and m.role = 'owner'
  ) then
    return v_workspace_id;
  end if;

  -- Preserve existing 0.5–0.12 data by adopting the user's oldest owned
  -- organization as the hidden personal workspace whenever one already exists.
  select o.id
    into v_workspace_id
  from public.organizations o
  join public.organization_members m on m.organization_id = o.id
  where m.user_id = p_user_id
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

    v_slug := 'personal-' || substr(replace(p_user_id::text, '-', ''), 1, 12)
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.organizations (name, slug, created_by)
    values (v_workspace_name, v_slug, p_user_id)
    returning id into v_workspace_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner')
    on conflict (organization_id, user_id) do update set role = 'owner';

    v_created := true;
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
    case when v_created then 'personal_workspace.created' else 'personal_workspace.adopted' end,
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
  where o.id = v_workspace_id;
end;
$$;

-- New signups are fully provisioned without a Create Organization onboarding
-- step. Existing auth-user updates remain idempotent.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, public.profiles.display_name),
      updated_at = now();

  perform public.ensure_personal_workspace_for_user(new.id);
  return new;
end;
$$;

-- Backfill current 0.12 users. When an existing Owner workspace exists it is
-- adopted, so all already-built gateway/import/recipient/composer rows retain
-- the same organization_id and no user data is moved or duplicated.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select u.id from auth.users u loop
    perform public.ensure_personal_workspace_for_user(v_user_id);
  end loop;
end;
$$;

-- Individual accounts may read only their own profile. The old same-tenant
-- profile visibility existed solely for Team/RBAC UX.
drop policy if exists "profiles_select_same_org_or_self" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles for select to authenticated
using (id = auth.uid());

-- The tenant container remains internal. Existing downstream security-definer
-- RPCs continue to use organization_id and owner membership, while normal web
-- clients no longer receive direct organization/team table access.
revoke select, update on table public.organizations from authenticated;
revoke select on table public.organization_members from authenticated;
revoke select on table public.organization_invitations from authenticated;

-- Disable user-facing multi-organization/team workflows without dropping their
-- schema. This keeps a clean migration path for a future Organizations release.
revoke execute on function public.list_my_organizations() from authenticated;
revoke execute on function public.create_organization(text) from authenticated;
revoke execute on function public.create_organization_invitation(uuid, text, text) from authenticated;
revoke execute on function public.get_organization_invitation_preview(text) from authenticated;
revoke execute on function public.accept_organization_invitation(text) from authenticated;
revoke execute on function public.set_organization_member_role(uuid, uuid, text) from authenticated;
revoke execute on function public.remove_organization_member(uuid, uuid) from authenticated;
revoke execute on function public.revoke_organization_invitation(uuid) from authenticated;

revoke all on function public.ensure_personal_workspace_for_user(uuid) from public, anon, authenticated;
revoke all on function public.ensure_personal_workspace() from public, anon;
revoke all on function public.get_my_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;
grant execute on function public.get_my_personal_workspace() to authenticated;

update public.app_meta
set value = jsonb_build_object(
      'version', '0.12.1',
      'phase', 'individual_account_transition',
      'tenant_model', 'hidden_personal_workspace'
    ),
    updated_at = now()
where key = 'schema';

commit;
