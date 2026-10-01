begin;

-- BulkText Web 0.5.1 — Organization & RBAC Stabilization
-- Forward-only corrective migration. Do not edit the already-applied 0.5.0 migration.

-- Policies created in 0.5.0 reference helper functions whose second user-id
-- parameter was callable by authenticated clients. Remove those dependencies
-- before replacing the helpers with current-user-only signatures.
drop policy if exists "profiles_select_same_org_or_self" on public.profiles;
drop policy if exists "organizations_select_member" on public.organizations;
drop policy if exists "organizations_update_managers" on public.organizations;
drop policy if exists "organization_members_select_members" on public.organization_members;
drop policy if exists "organization_invitations_select_managers" on public.organization_invitations;
drop policy if exists "audit_logs_select_managers" on public.audit_logs;

revoke all on function public.shares_organization_with(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_manage_org(uuid, uuid) from public, anon, authenticated;
revoke all on function public.org_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_org_member(uuid, uuid) from public, anon, authenticated;

drop function if exists public.shares_organization_with(uuid, uuid);
drop function if exists public.can_manage_org(uuid, uuid);
drop function if exists public.org_role(uuid, uuid);
drop function if exists public.is_org_member(uuid, uuid);

-- Safe helpers are intentionally scoped to auth.uid(). They can be used by
-- RLS and clients without allowing callers to inspect arbitrary user IDs.
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
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
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_manage_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.org_role(p_organization_id) in ('owner', 'admin'), false);
$$;

create or replace function public.shares_organization_with(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_other_user_id
  );
$$;

-- Use a stable, current-user-scoped RPC for the organization switcher. This
-- avoids relying on a nested PostgREST relationship query immediately after
-- organization creation while preserving table RLS for the rest of the UI.
create or replace function public.list_my_organizations()
returns table(
  organization_id uuid,
  name text,
  slug text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.slug,
    m.role,
    m.joined_at
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
  order by m.joined_at asc, o.id asc;
$$;

-- Recreate organization creation with explicit null handling and the same
-- UUID return contract used by the 0.5 frontend.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_org_id uuid;
  v_slug_base text;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Organization name must be between 2 and 100 characters' using errcode = '22023';
  end if;

  v_slug_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug_base = '' then
    v_slug_base := 'workspace';
  end if;

  v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.organizations (name, slug, created_by)
  values (v_name, v_slug, v_user_id)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_org_id, v_user_id, 'organization.created', 'organization', v_org_id::text);

  return v_org_id;
end;
$$;

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text
)
returns table(invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'Valid invitation email required' using errcode = '22023';
  end if;

  if p_role not in ('admin', 'campaign_manager', 'analyst', 'billing') then
    raise exception 'Invalid invitation role' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.organization_members m on m.user_id = p.id
    where m.organization_id = p_organization_id
      and lower(p.email) = v_email
  ) then
    raise exception 'User is already a member of this organization' using errcode = '23505';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where organization_id = p_organization_id
    and lower(email) = v_email
    and status = 'pending';

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    token_hash,
    invited_by,
    expires_at
  ) values (
    p_organization_id,
    v_email,
    p_role,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_user_id,
    v_expires_at
  )
  returning id into v_invitation_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_organization_id,
    v_user_id,
    'organization.invitation_created',
    'invitation',
    v_invitation_id::text,
    jsonb_build_object('email', v_email, 'role', p_role)
  );

  invitation_id := v_invitation_id;
  invite_token := v_token;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.set_organization_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target_role text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'campaign_manager', 'analyst', 'billing') then
    raise exception 'Invalid member role' using errcode = '22023';
  end if;

  select m.role into v_target_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id;

  if v_target_role is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner role cannot be changed here' using errcode = '42501';
  end if;

  if v_actor = p_user_id then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  update public.organization_members
  set role = p_role
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    p_organization_id,
    v_actor,
    'organization.member_role_changed',
    'user',
    p_user_id::text,
    jsonb_build_object('from', v_target_role, 'to', p_role)
  );
end;
$$;

create or replace function public.remove_organization_member(
  p_organization_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_target_role text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select m.role into v_target_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id;

  if v_target_role is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner cannot be removed' using errcode = '42501';
  end if;

  if v_actor = p_user_id then
    raise exception 'You cannot remove yourself' using errcode = '42501';
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    p_organization_id,
    v_actor,
    'organization.member_removed',
    'user',
    p_user_id::text,
    jsonb_build_object('role', v_target_role)
  );
end;
$$;

create or replace function public.revoke_organization_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select organization_id into v_org_id
  from public.organization_invitations
  where id = p_invitation_id
    and status = 'pending';

  if v_org_id is null then
    raise exception 'Pending invitation not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_org(v_org_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where id = p_invitation_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_org_id, v_actor, 'organization.invitation_revoked', 'invitation', p_invitation_id::text);
end;
$$;

-- Recreate RLS policies against current-user-only helper signatures.
create policy "profiles_select_same_org_or_self"
on public.profiles for select to authenticated
using (id = auth.uid() or public.shares_organization_with(id));

create policy "organizations_select_member"
on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy "organizations_update_managers"
on public.organizations for update to authenticated
using (public.can_manage_org(id))
with check (public.can_manage_org(id));

create policy "organization_members_select_members"
on public.organization_members for select to authenticated
using (public.is_org_member(organization_id));

create policy "organization_invitations_select_managers"
on public.organization_invitations for select to authenticated
using (public.can_manage_org(organization_id));

create policy "audit_logs_select_managers"
on public.audit_logs for select to authenticated
using (public.can_manage_org(organization_id));

-- Deterministic table privileges. RLS controls row visibility; direct writes to
-- membership/invitation/audit records remain RPC-only.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.organization_invitations from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.organizations to authenticated;
grant update (name) on table public.organizations to authenticated;

grant select on table public.organization_members to authenticated;
grant select on table public.organization_invitations to authenticated;
grant select on table public.audit_logs to authenticated;

-- Function privileges: no RPC is available anonymously in this phase.
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.org_role(uuid) from public, anon;
revoke all on function public.can_manage_org(uuid) from public, anon;
revoke all on function public.shares_organization_with(uuid) from public, anon;
revoke all on function public.list_my_organizations() from public, anon;
revoke all on function public.create_organization(text) from public, anon;
revoke all on function public.create_organization_invitation(uuid, text, text) from public, anon;
revoke all on function public.get_organization_invitation_preview(text) from public, anon;
revoke all on function public.accept_organization_invitation(text) from public, anon;
revoke all on function public.set_organization_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
revoke all on function public.revoke_organization_invitation(uuid) from public, anon;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_role(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;
grant execute on function public.shares_organization_with(uuid) to authenticated;
grant execute on function public.list_my_organizations() to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.create_organization_invitation(uuid, text, text) to authenticated;
grant execute on function public.get_organization_invitation_preview(text) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.set_organization_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;

update public.app_meta
set value = jsonb_build_object('version', '0.5.1', 'phase', 'organization_rbac_stabilization'),
    updated_at = now()
where key = 'schema';

commit;
