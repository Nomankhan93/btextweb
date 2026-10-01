begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
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

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','campaign_manager','analyst','billing')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','campaign_manager','analyst','billing')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_invitations_one_pending_per_email
on public.organization_invitations (organization_id, lower(email))
where status = 'pending';

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

create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists organization_invitations_org_idx on public.organization_invitations(organization_id, status);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
  return new;
end;
$$;

create or replace function public.is_org_member(p_organization_id uuid, p_user_id uuid default auth.uid())
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
      and m.user_id = p_user_id
  );
$$;

create or replace function public.org_role(p_organization_id uuid, p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id
  limit 1;
$$;

create or replace function public.can_manage_org(p_organization_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.org_role(p_organization_id, p_user_id) in ('owner','admin'), false);
$$;

create or replace function public.shares_organization_with(p_other_user_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = p_user_id
      and b.user_id = p_other_user_id
  );
$$;

create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_name);
  v_org_id uuid;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Organization name must be between 2 and 100 characters';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

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
  v_email text := lower(trim(p_email));
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_user_id is null or not public.can_manage_org(p_organization_id, v_user_id) then
    raise exception 'Insufficient permission';
  end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'Valid invitation email required';
  end if;

  if p_role not in ('admin','campaign_manager','analyst','billing') then
    raise exception 'Invalid invitation role';
  end if;

  if exists (
    select 1 from public.profiles p
    join public.organization_members m on m.user_id = p.id
    where m.organization_id = p_organization_id and lower(p.email) = v_email
  ) then
    raise exception 'User is already a member of this organization';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where organization_id = p_organization_id
    and lower(email) = v_email
    and status = 'pending';

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.organization_invitations (
    organization_id, email, role, token_hash, invited_by, expires_at
  ) values (
    p_organization_id,
    v_email,
    p_role,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_user_id,
    v_expires_at
  ) returning id into v_invitation_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
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

create or replace function public.get_organization_invitation_preview(p_token text)
returns table(organization_name text, invited_email text, invited_role text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select o.name, i.email, i.role, i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;
$$;

create or replace function public.accept_organization_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_inv public.organization_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(email) into v_user_email from auth.users where id = v_user_id;

  select * into v_inv
  from public.organization_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and status = 'pending'
  for update;

  if v_inv.id is null then
    raise exception 'Invitation not found or already used';
  end if;

  if v_inv.expires_at <= now() then
    update public.organization_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'Invitation expired';
  end if;

  if lower(v_inv.email) <> v_user_email then
    raise exception 'Invitation email does not match the signed-in account';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_user_id, v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_inv.organization_id, v_user_id, 'organization.invitation_accepted', 'invitation', v_inv.id::text);

  return v_inv.organization_id;
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
  v_actor_role text;
  v_target_role text;
begin
  v_actor_role := public.org_role(p_organization_id, v_actor);
  v_target_role := public.org_role(p_organization_id, p_user_id);

  if v_actor_role not in ('owner','admin') then
    raise exception 'Insufficient permission';
  end if;

  if p_role not in ('admin','campaign_manager','analyst','billing') then
    raise exception 'Invalid member role';
  end if;

  if v_target_role is null then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner role cannot be changed here';
  end if;

  if v_actor = p_user_id then
    raise exception 'You cannot change your own role';
  end if;

  update public.organization_members
  set role = p_role
  where organization_id = p_organization_id and user_id = p_user_id;

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
  v_actor_role text;
  v_target_role text;
begin
  v_actor_role := public.org_role(p_organization_id, v_actor);
  v_target_role := public.org_role(p_organization_id, p_user_id);

  if v_actor_role not in ('owner','admin') then
    raise exception 'Insufficient permission';
  end if;

  if v_target_role is null then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Owner cannot be removed';
  end if;

  if v_actor = p_user_id then
    raise exception 'You cannot remove yourself';
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;

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
  select organization_id into v_org_id
  from public.organization_invitations
  where id = p_invitation_id and status = 'pending';

  if v_org_id is null then
    raise exception 'Pending invitation not found';
  end if;

  if not public.can_manage_org(v_org_id, v_actor) then
    raise exception 'Insufficient permission';
  end if;

  update public.organization_invitations set status = 'revoked' where id = p_invitation_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_org_id, v_actor, 'organization.invitation_revoked', 'invitation', p_invitation_id::text);
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, email, display_name)
select id, coalesce(email, ''), nullif(trim(coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'full_name', '')), '')
from auth.users
on conflict (id) do update
set email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_same_org_or_self"
on public.profiles for select to authenticated
using (id = auth.uid() or public.shares_organization_with(id));

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

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

-- Keep identity and ownership columns server-controlled. Clients may only edit safe display fields.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke update on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

revoke all on function public.is_org_member(uuid, uuid) from public;
revoke all on function public.org_role(uuid, uuid) from public;
revoke all on function public.can_manage_org(uuid, uuid) from public;
revoke all on function public.shares_organization_with(uuid, uuid) from public;
revoke all on function public.create_organization(text) from public;
revoke all on function public.create_organization_invitation(uuid, text, text) from public;
revoke all on function public.get_organization_invitation_preview(text) from public;
revoke all on function public.accept_organization_invitation(text) from public;
revoke all on function public.set_organization_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_organization_member(uuid, uuid) from public;
revoke all on function public.revoke_organization_invitation(uuid) from public;

grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.org_role(uuid, uuid) to authenticated;
grant execute on function public.can_manage_org(uuid, uuid) to authenticated;
grant execute on function public.shares_organization_with(uuid, uuid) to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.create_organization_invitation(uuid, text, text) to authenticated;
grant execute on function public.get_organization_invitation_preview(text) to authenticated;
grant execute on function public.accept_organization_invitation(text) to authenticated;
grant execute on function public.set_organization_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;

update public.app_meta
set value = jsonb_build_object('version', '0.5.0', 'phase', 'auth_organizations_rbac'),
    updated_at = now()
where key = 'schema';

commit;
