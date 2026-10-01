begin;

-- BulkText 0.6.0 — Secure Android Device Pairing
-- Pairing codes are short-lived bearer secrets. Raw codes and device credentials
-- are returned once and only their SHA-256 hashes are persisted.

create table if not exists public.gateway_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  platform text not null default 'android' check (platform = 'android'),
  installation_fingerprint_hash text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  credential_version integer not null default 1 check (credential_version >= 1),
  paired_by uuid references auth.users(id) on delete set null,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gateway_devices_one_active_installation
on public.gateway_devices (installation_fingerprint_hash)
where status = 'active';

create index if not exists gateway_devices_org_status_idx
on public.gateway_devices (organization_id, status, paired_at desc);

create table if not exists public.gateway_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_device_id uuid references public.gateway_devices(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists gateway_pairing_codes_org_created_idx
on public.gateway_pairing_codes (organization_id, created_at desc);

create table if not exists public.gateway_device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.gateway_devices(id) on delete cascade,
  version integer not null check (version >= 1),
  secret_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (device_id, version),
  check (expires_at > issued_at)
);

create index if not exists gateway_device_credentials_active_idx
on public.gateway_device_credentials (device_id, version desc)
where revoked_at is null;

alter table public.gateway_devices enable row level security;
alter table public.gateway_pairing_codes enable row level security;
alter table public.gateway_device_credentials enable row level security;

-- Defense in depth: browser clients do not access pairing/credential tables
-- directly. All access goes through scoped RPCs below.
revoke all on table public.gateway_devices from public, anon, authenticated;
revoke all on table public.gateway_pairing_codes from public, anon, authenticated;
revoke all on table public.gateway_device_credentials from public, anon, authenticated;

create trigger gateway_devices_set_updated_at
before update on public.gateway_devices
for each row execute function public.set_updated_at();

create or replace function public.create_gateway_pairing_code(p_organization_id uuid)
returns table(
  pairing_id uuid,
  pairing_code text,
  pairing_uri text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text;
  v_pairing_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_attempt integer;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  for v_attempt in 1..5 loop
    v_bytes := gen_random_bytes(12);
    v_code := '';
    for i in 0..11 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % char_length(v_alphabet)) + 1, 1);
    end loop;

    begin
      insert into public.gateway_pairing_codes (
        organization_id,
        code_hash,
        created_by,
        expires_at
      ) values (
        p_organization_id,
        encode(digest(v_code, 'sha256'), 'hex'),
        v_actor,
        v_expires_at
      ) returning id into v_pairing_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_organization_id,
    v_actor,
    'gateway.pairing_created',
    'gateway_pairing',
    v_pairing_id::text,
    jsonb_build_object('expires_at', v_expires_at)
  );

  pairing_id := v_pairing_id;
  pairing_code := v_code;
  pairing_uri := 'bulktext://pair?code=' || v_code;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.list_gateway_pairing_sessions(p_organization_id uuid)
returns table(
  pairing_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  claimed_at timestamptz,
  revoked_at timestamptz,
  claimed_device_id uuid,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.created_at,
    p.expires_at,
    p.claimed_at,
    p.revoked_at,
    p.claimed_device_id,
    case
      when p.revoked_at is not null then 'revoked'
      when p.claimed_at is not null then 'claimed'
      when p.expires_at <= now() then 'expired'
      else 'pending'
    end
  from public.gateway_pairing_codes p
  where p.organization_id = p_organization_id
  order by p.created_at desc
  limit 20;
end;
$$;

create or replace function public.revoke_gateway_pairing_code(p_pairing_id uuid)
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

  select p.organization_id into v_org_id
  from public.gateway_pairing_codes p
  where p.id = p_pairing_id
    and p.claimed_at is null
    and p.revoked_at is null
    and p.expires_at > now()
  for update;

  if v_org_id is null then
    raise exception 'Active pairing code not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_org(v_org_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.gateway_pairing_codes
  set revoked_at = now()
  where id = p_pairing_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_org_id, v_actor, 'gateway.pairing_revoked', 'gateway_pairing', p_pairing_id::text);
end;
$$;

create or replace function public.claim_gateway_pairing(
  p_pairing_code text,
  p_device_name text,
  p_installation_id text
)
returns table(
  device_id uuid,
  organization_id uuid,
  organization_name text,
  device_name text,
  credential text,
  credential_version integer,
  credential_expires_at timestamptz,
  paired_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := regexp_replace(upper(coalesce(p_pairing_code, '')), '[^A-Z0-9]', '', 'g');
  v_device_name text := trim(coalesce(p_device_name, ''));
  v_installation_id text := trim(coalesce(p_installation_id, ''));
  v_fingerprint_hash text;
  v_pair public.gateway_pairing_codes%rowtype;
  v_org_name text;
  v_device_id uuid;
  v_credential text;
  v_credential_expires_at timestamptz := now() + interval '90 days';
  v_paired_at timestamptz := now();
begin
  if char_length(v_code) <> 12 then
    raise exception 'Pairing code is invalid or expired' using errcode = 'P0002';
  end if;

  if char_length(v_device_name) < 2 or char_length(v_device_name) > 80 then
    raise exception 'Device name must be between 2 and 80 characters' using errcode = '22023';
  end if;

  if char_length(v_installation_id) < 16 or char_length(v_installation_id) > 200 then
    raise exception 'Installation identifier is invalid' using errcode = '22023';
  end if;

  select p.* into v_pair
  from public.gateway_pairing_codes p
  where p.code_hash = encode(digest(v_code, 'sha256'), 'hex')
    and p.claimed_at is null
    and p.revoked_at is null
    and p.expires_at > now()
  for update;

  if v_pair.id is null then
    raise exception 'Pairing code is invalid or expired' using errcode = 'P0002';
  end if;

  v_fingerprint_hash := encode(digest(v_installation_id, 'sha256'), 'hex');

  if exists (
    select 1
    from public.gateway_devices d
    where d.installation_fingerprint_hash = v_fingerprint_hash
      and d.status = 'active'
  ) then
    raise exception 'This gateway installation is already paired. Unpair it before pairing again.' using errcode = '23505';
  end if;

  select o.name into v_org_name
  from public.organizations o
  where o.id = v_pair.organization_id;

  if v_org_name is null then
    raise exception 'Pairing organization no longer exists' using errcode = 'P0002';
  end if;

  insert into public.gateway_devices (
    organization_id,
    display_name,
    installation_fingerprint_hash,
    paired_by,
    paired_at
  ) values (
    v_pair.organization_id,
    v_device_name,
    v_fingerprint_hash,
    v_pair.created_by,
    v_paired_at
  ) returning id into v_device_id;

  v_credential := 'btg_' || encode(gen_random_bytes(32), 'hex');

  insert into public.gateway_device_credentials (
    device_id,
    version,
    secret_hash,
    expires_at
  ) values (
    v_device_id,
    1,
    encode(digest(v_credential, 'sha256'), 'hex'),
    v_credential_expires_at
  );

  update public.gateway_pairing_codes
  set claimed_at = v_paired_at,
      claimed_device_id = v_device_id
  where id = v_pair.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_pair.organization_id,
    v_pair.created_by,
    'gateway.device_paired',
    'gateway_device',
    v_device_id::text,
    jsonb_build_object('pairing_id', v_pair.id, 'platform', 'android')
  );

  device_id := v_device_id;
  organization_id := v_pair.organization_id;
  organization_name := v_org_name;
  device_name := v_device_name;
  credential := v_credential;
  credential_version := 1;
  credential_expires_at := v_credential_expires_at;
  paired_at := v_paired_at;
  return next;
end;
$$;

create or replace function public.authenticate_gateway_device(
  p_device_id uuid,
  p_credential text
)
returns table(
  device_id uuid,
  organization_id uuid,
  device_name text,
  credential_version integer,
  credential_expires_at timestamptz,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device public.gateway_devices%rowtype;
  v_credential public.gateway_device_credentials%rowtype;
  v_now timestamptz := now();
begin
  if p_device_id is null or char_length(coalesce(p_credential, '')) < 20 then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.gateway_devices d
  where d.id = p_device_id
    and d.status = 'active'
  for update;

  if v_device.id is null then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  select c.* into v_credential
  from public.gateway_device_credentials c
  where c.device_id = p_device_id
    and c.secret_hash = encode(digest(p_credential, 'sha256'), 'hex')
    and c.revoked_at is null
    and c.expires_at > v_now
  for update;

  if v_credential.id is null then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  update public.gateway_device_credentials
  set last_used_at = v_now
  where id = v_credential.id;

  update public.gateway_devices
  set last_seen_at = v_now
  where id = v_device.id;

  device_id := v_device.id;
  organization_id := v_device.organization_id;
  device_name := v_device.display_name;
  credential_version := v_credential.version;
  credential_expires_at := v_credential.expires_at;
  server_time := v_now;
  return next;
end;
$$;

create or replace function public.rotate_gateway_device_credential(
  p_device_id uuid,
  p_current_credential text
)
returns table(
  device_id uuid,
  credential text,
  credential_version integer,
  credential_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device public.gateway_devices%rowtype;
  v_current public.gateway_device_credentials%rowtype;
  v_version integer;
  v_new_credential text;
  v_expires_at timestamptz := now() + interval '90 days';
begin
  select d.* into v_device
  from public.gateway_devices d
  where d.id = p_device_id
    and d.status = 'active'
  for update;

  if v_device.id is null then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  select c.* into v_current
  from public.gateway_device_credentials c
  where c.device_id = p_device_id
    and c.secret_hash = encode(digest(coalesce(p_current_credential, ''), 'sha256'), 'hex')
    and c.revoked_at is null
    and c.expires_at > now()
  for update;

  if v_current.id is null then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  v_version := v_device.credential_version + 1;
  v_new_credential := 'btg_' || encode(gen_random_bytes(32), 'hex');

  update public.gateway_device_credentials
  set revoked_at = now()
  where device_id = p_device_id
    and revoked_at is null;

  insert into public.gateway_device_credentials (
    device_id,
    version,
    secret_hash,
    expires_at
  ) values (
    p_device_id,
    v_version,
    encode(digest(v_new_credential, 'sha256'), 'hex'),
    v_expires_at
  );

  update public.gateway_devices
  set credential_version = v_version,
      last_seen_at = now()
  where id = p_device_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_device.organization_id,
    null,
    'gateway.credential_rotated',
    'gateway_device',
    p_device_id::text,
    jsonb_build_object('credential_version', v_version, 'device_authenticated', true)
  );

  device_id := p_device_id;
  credential := v_new_credential;
  credential_version := v_version;
  credential_expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.list_gateway_devices(p_organization_id uuid)
returns table(
  device_id uuid,
  display_name text,
  platform text,
  status text,
  credential_version integer,
  credential_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.display_name,
    d.platform,
    d.status,
    d.credential_version,
    c.expires_at,
    d.paired_at,
    d.last_seen_at,
    d.revoked_at
  from public.gateway_devices d
  left join lateral (
    select gc.expires_at
    from public.gateway_device_credentials gc
    where gc.device_id = d.id
      and gc.revoked_at is null
    order by gc.version desc
    limit 1
  ) c on true
  where d.organization_id = p_organization_id
  order by (d.status = 'active') desc, d.paired_at desc;
end;
$$;

create or replace function public.revoke_gateway_device(
  p_organization_id uuid,
  p_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_device public.gateway_devices%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.gateway_devices d
  where d.id = p_device_id
    and d.organization_id = p_organization_id
    and d.status = 'active'
  for update;

  if v_device.id is null then
    raise exception 'Active gateway device not found' using errcode = 'P0002';
  end if;

  update public.gateway_devices
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_actor
  where id = p_device_id;

  update public.gateway_device_credentials
  set revoked_at = coalesce(revoked_at, now())
  where device_id = p_device_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_organization_id,
    v_actor,
    'gateway.device_revoked',
    'gateway_device',
    p_device_id::text,
    jsonb_build_object('device_name', v_device.display_name)
  );
end;
$$;

-- Explicit function exposure. Pairing claim and device-auth functions are
-- intentionally callable by anon because the pairing code/device credential
-- themselves are scoped bearer secrets. All management operations require an
-- authenticated organization role inside the function.
revoke all on function public.create_gateway_pairing_code(uuid) from public, anon;
revoke all on function public.list_gateway_pairing_sessions(uuid) from public, anon;
revoke all on function public.revoke_gateway_pairing_code(uuid) from public, anon;
revoke all on function public.claim_gateway_pairing(text, text, text) from public;
revoke all on function public.authenticate_gateway_device(uuid, text) from public;
revoke all on function public.rotate_gateway_device_credential(uuid, text) from public;
revoke all on function public.list_gateway_devices(uuid) from public, anon;
revoke all on function public.revoke_gateway_device(uuid, uuid) from public, anon;

grant execute on function public.create_gateway_pairing_code(uuid) to authenticated;
grant execute on function public.list_gateway_pairing_sessions(uuid) to authenticated;
grant execute on function public.revoke_gateway_pairing_code(uuid) to authenticated;
grant execute on function public.claim_gateway_pairing(text, text, text) to anon, authenticated;
grant execute on function public.authenticate_gateway_device(uuid, text) to anon, authenticated;
grant execute on function public.rotate_gateway_device_credential(uuid, text) to anon, authenticated;
grant execute on function public.list_gateway_devices(uuid) to authenticated;
grant execute on function public.revoke_gateway_device(uuid, uuid) to authenticated;

update public.app_meta
set value = jsonb_build_object('version', '0.6.0', 'phase', 'secure_android_device_pairing'),
    updated_at = now()
where key = 'schema';

commit;
