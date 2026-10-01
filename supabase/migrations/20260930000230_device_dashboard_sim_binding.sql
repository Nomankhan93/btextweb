begin;

-- BulkText 0.7.0 — Device Dashboard & SIM Binding
-- Extends the 0.6 device identity boundary with authenticated Android inventory
-- reporting and explicit organization-controlled SIM binding. A missing/replaced
-- SIM never causes silent fallback to another subscription.

alter table public.gateway_devices
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists android_release text,
  add column if not exists sdk_int integer,
  add column if not exists app_version text,
  add column if not exists app_version_code integer,
  add column if not exists battery_percent smallint,
  add column if not exists last_inventory_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gateway_devices_sdk_int_check'
      and conrelid = 'public.gateway_devices'::regclass
  ) then
    alter table public.gateway_devices
      add constraint gateway_devices_sdk_int_check
      check (sdk_int is null or sdk_int between 21 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'gateway_devices_app_version_code_check'
      and conrelid = 'public.gateway_devices'::regclass
  ) then
    alter table public.gateway_devices
      add constraint gateway_devices_app_version_code_check
      check (app_version_code is null or app_version_code >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'gateway_devices_battery_percent_check'
      and conrelid = 'public.gateway_devices'::regclass
  ) then
    alter table public.gateway_devices
      add constraint gateway_devices_battery_percent_check
      check (battery_percent is null or battery_percent between 0 and 100);
  end if;
end $$;

create table if not exists public.gateway_device_sims (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.gateway_devices(id) on delete cascade,
  subscription_id integer not null check (subscription_id >= 0),
  slot_index integer not null check (slot_index between 0 and 7),
  carrier_name text,
  display_name text,
  country_iso text,
  is_embedded boolean not null default false,
  sim_identity_hash text,
  present boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, subscription_id),
  check (sim_identity_hash is null or sim_identity_hash ~ '^[0-9a-f]{64}$')
);

create unique index if not exists gateway_device_sims_present_slot_unique
on public.gateway_device_sims (device_id, slot_index)
where present;

create index if not exists gateway_device_sims_device_present_idx
on public.gateway_device_sims (device_id, present desc, slot_index, subscription_id);

create table if not exists public.gateway_device_sim_bindings (
  device_id uuid primary key references public.gateway_devices(id) on delete cascade,
  sim_id uuid not null references public.gateway_device_sims(id) on delete restrict,
  bound_by uuid references auth.users(id) on delete set null,
  bound_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gateway_device_sims enable row level security;
alter table public.gateway_device_sim_bindings enable row level security;

revoke all on table public.gateway_device_sims from public, anon, authenticated;
revoke all on table public.gateway_device_sim_bindings from public, anon, authenticated;

drop trigger if exists gateway_device_sims_set_updated_at on public.gateway_device_sims;
create trigger gateway_device_sims_set_updated_at
before update on public.gateway_device_sims
for each row execute function public.set_updated_at();

drop trigger if exists gateway_device_sim_bindings_set_updated_at on public.gateway_device_sim_bindings;
create trigger gateway_device_sim_bindings_set_updated_at
before update on public.gateway_device_sim_bindings
for each row execute function public.set_updated_at();

create or replace function public.report_gateway_device_inventory(
  p_device_id uuid,
  p_credential text,
  p_device jsonb,
  p_sims jsonb
)
returns table(
  device_id uuid,
  organization_id uuid,
  server_time timestamptz,
  bound_sim_id uuid,
  bound_subscription_id integer,
  bound_slot_index integer,
  bound_carrier_name text,
  binding_status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := now();
  v_device public.gateway_devices%rowtype;
  v_credential public.gateway_device_credentials%rowtype;
  v_sim jsonb;
  v_subscription_id integer;
  v_slot_index integer;
  v_carrier_name text;
  v_display_name text;
  v_country_iso text;
  v_is_embedded boolean;
  v_sim_identity_hash text;
  v_bound_sim public.gateway_device_sims%rowtype;
  v_bound_id uuid;
  v_binding_status text := 'unbound';
  v_manufacturer text;
  v_model text;
  v_android_release text;
  v_app_version text;
  v_sdk_int integer;
  v_app_version_code integer;
  v_battery_percent integer;
begin
  if p_device_id is null or char_length(coalesce(p_credential, '')) < 20 then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  if p_device is null or jsonb_typeof(p_device) <> 'object' then
    raise exception 'Device inventory payload must be an object' using errcode = '22023';
  end if;

  if p_sims is null or jsonb_typeof(p_sims) <> 'array' then
    raise exception 'SIM inventory payload must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_sims) > 8 then
    raise exception 'SIM inventory exceeds the supported slot count' using errcode = '22023';
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
    and c.secret_hash = encode(digest(coalesce(p_credential, ''), 'sha256'), 'hex')
    and c.revoked_at is null
    and c.expires_at > v_now
  for update;

  if v_credential.id is null then
    raise exception 'Invalid gateway credential' using errcode = '42501';
  end if;

  v_manufacturer := nullif(trim(coalesce(p_device ->> 'manufacturer', '')), '');
  v_model := nullif(trim(coalesce(p_device ->> 'model', '')), '');
  v_android_release := nullif(trim(coalesce(p_device ->> 'androidRelease', '')), '');
  v_app_version := nullif(trim(coalesce(p_device ->> 'appVersion', '')), '');

  begin
    v_sdk_int := nullif(p_device ->> 'sdkInt', '')::integer;
    v_app_version_code := nullif(p_device ->> 'appVersionCode', '')::integer;
    v_battery_percent := nullif(p_device ->> 'batteryPercent', '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Device inventory contains invalid numeric values' using errcode = '22023';
  end;

  if char_length(coalesce(v_manufacturer, '')) > 80
     or char_length(coalesce(v_model, '')) > 120
     or char_length(coalesce(v_android_release, '')) > 40
     or char_length(coalesce(v_app_version, '')) > 40 then
    raise exception 'Device inventory contains an oversized text value' using errcode = '22023';
  end if;

  if v_sdk_int is not null and (v_sdk_int < 21 or v_sdk_int > 100) then
    raise exception 'Android SDK value is invalid' using errcode = '22023';
  end if;

  if v_app_version_code is not null and v_app_version_code < 0 then
    raise exception 'App version code is invalid' using errcode = '22023';
  end if;

  if v_battery_percent is not null and (v_battery_percent < 0 or v_battery_percent > 100) then
    raise exception 'Battery percent is invalid' using errcode = '22023';
  end if;

  update public.gateway_device_credentials
  set last_used_at = v_now
  where id = v_credential.id;

  update public.gateway_devices
  set manufacturer = v_manufacturer,
      model = v_model,
      android_release = v_android_release,
      sdk_int = v_sdk_int,
      app_version = v_app_version,
      app_version_code = v_app_version_code,
      battery_percent = v_battery_percent,
      last_seen_at = v_now,
      last_inventory_at = v_now
  where id = p_device_id;

  -- Mark prior subscriptions absent before upserting the current Android view.
  -- A binding to an absent subscription remains in place and therefore becomes
  -- explicitly unusable rather than silently moving to another SIM.
  update public.gateway_device_sims
  set present = false
  where device_id = p_device_id
    and present;

  for v_sim in select value from jsonb_array_elements(p_sims)
  loop
    if jsonb_typeof(v_sim) <> 'object' then
      raise exception 'Each SIM inventory entry must be an object' using errcode = '22023';
    end if;

    begin
      v_subscription_id := (v_sim ->> 'subscriptionId')::integer;
      v_slot_index := (v_sim ->> 'slotIndex')::integer;
    exception when invalid_text_representation or null_value_not_allowed or numeric_value_out_of_range then
      raise exception 'SIM subscriptionId and slotIndex must be integers' using errcode = '22023';
    end;

    if v_subscription_id is null or v_slot_index is null
       or v_subscription_id < 0 or v_slot_index < 0 or v_slot_index > 7 then
      raise exception 'SIM subscription or slot value is invalid' using errcode = '22023';
    end if;

    v_carrier_name := nullif(trim(coalesce(v_sim ->> 'carrierName', '')), '');
    v_display_name := nullif(trim(coalesce(v_sim ->> 'displayName', '')), '');
    v_country_iso := lower(nullif(trim(coalesce(v_sim ->> 'countryIso', '')), ''));
    v_is_embedded := coalesce((v_sim ->> 'isEmbedded')::boolean, false);
    v_sim_identity_hash := lower(nullif(trim(coalesce(v_sim ->> 'simIdentityHash', '')), ''));

    if char_length(coalesce(v_carrier_name, '')) > 100
       or char_length(coalesce(v_display_name, '')) > 100
       or char_length(coalesce(v_country_iso, '')) > 8 then
      raise exception 'SIM inventory contains an oversized text value' using errcode = '22023';
    end if;

    if v_sim_identity_hash is not null and v_sim_identity_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'SIM identity hash must be a SHA-256 hex digest' using errcode = '22023';
    end if;

    insert into public.gateway_device_sims (
      device_id,
      subscription_id,
      slot_index,
      carrier_name,
      display_name,
      country_iso,
      is_embedded,
      sim_identity_hash,
      present,
      first_seen_at,
      last_seen_at
    ) values (
      p_device_id,
      v_subscription_id,
      v_slot_index,
      v_carrier_name,
      v_display_name,
      v_country_iso,
      v_is_embedded,
      v_sim_identity_hash,
      true,
      v_now,
      v_now
    )
    on conflict (device_id, subscription_id) do update
      set slot_index = excluded.slot_index,
          carrier_name = excluded.carrier_name,
          display_name = excluded.display_name,
          country_iso = excluded.country_iso,
          is_embedded = excluded.is_embedded,
          sim_identity_hash = excluded.sim_identity_hash,
          present = true,
          last_seen_at = excluded.last_seen_at;
  end loop;

  select b.sim_id into v_bound_id
  from public.gateway_device_sim_bindings b
  where b.device_id = p_device_id;

  if v_bound_id is not null then
    select s.* into v_bound_sim
    from public.gateway_device_sims s
    where s.id = v_bound_id;

    if v_bound_sim.id is not null and v_bound_sim.present then
      v_binding_status := 'ready';
    else
      v_binding_status := 'missing';
    end if;
  end if;

  device_id := p_device_id;
  organization_id := v_device.organization_id;
  server_time := v_now;
  bound_sim_id := v_bound_id;
  bound_subscription_id := v_bound_sim.subscription_id;
  bound_slot_index := v_bound_sim.slot_index;
  bound_carrier_name := v_bound_sim.carrier_name;
  binding_status := v_binding_status;
  return next;
end;
$$;

create or replace function public.list_gateway_device_dashboard(p_organization_id uuid)
returns table(
  device_id uuid,
  display_name text,
  platform text,
  status text,
  credential_version integer,
  credential_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  manufacturer text,
  model text,
  android_release text,
  sdk_int integer,
  app_version text,
  app_version_code integer,
  battery_percent smallint,
  last_inventory_at timestamptz,
  health_status text,
  bound_sim_id uuid,
  bound_subscription_id integer,
  bound_slot_index integer,
  bound_carrier_name text,
  binding_status text,
  sims jsonb
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
    d.revoked_at,
    d.manufacturer,
    d.model,
    d.android_release,
    d.sdk_int,
    d.app_version,
    d.app_version_code,
    d.battery_percent,
    d.last_inventory_at,
    case
      when d.status = 'revoked' then 'revoked'
      when d.last_seen_at is null then 'never_seen'
      when d.last_seen_at >= now() - interval '5 minutes' then 'recent'
      when d.last_seen_at >= now() - interval '24 hours' then 'stale'
      else 'offline'
    end,
    b.sim_id,
    bs.subscription_id,
    bs.slot_index,
    bs.carrier_name,
    case
      when b.sim_id is null then 'unbound'
      when bs.id is null or not bs.present then 'missing'
      else 'ready'
    end,
    coalesce(sim_list.sims, '[]'::jsonb)
  from public.gateway_devices d
  left join lateral (
    select gc.expires_at
    from public.gateway_device_credentials gc
    where gc.device_id = d.id
      and gc.revoked_at is null
    order by gc.version desc
    limit 1
  ) c on true
  left join public.gateway_device_sim_bindings b on b.device_id = d.id
  left join public.gateway_device_sims bs on bs.id = b.sim_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'simId', s.id,
        'subscriptionId', s.subscription_id,
        'slotIndex', s.slot_index,
        'carrierName', s.carrier_name,
        'displayName', s.display_name,
        'countryIso', s.country_iso,
        'isEmbedded', s.is_embedded,
        'present', s.present,
        'firstSeenAt', s.first_seen_at,
        'lastSeenAt', s.last_seen_at
      ) order by s.present desc, s.slot_index, s.subscription_id
    ) as sims
    from public.gateway_device_sims s
    where s.device_id = d.id
  ) sim_list on true
  where d.organization_id = p_organization_id
  order by (d.status = 'active') desc, d.paired_at desc;
end;
$$;

create or replace function public.bind_gateway_device_sim(
  p_organization_id uuid,
  p_device_id uuid,
  p_sim_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_device public.gateway_devices%rowtype;
  v_sim public.gateway_device_sims%rowtype;
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

  select s.* into v_sim
  from public.gateway_device_sims s
  where s.id = p_sim_id
    and s.device_id = p_device_id
    and s.present
  for update;

  if v_sim.id is null then
    raise exception 'Present SIM subscription not found for this gateway' using errcode = 'P0002';
  end if;

  insert into public.gateway_device_sim_bindings (device_id, sim_id, bound_by, bound_at)
  values (p_device_id, p_sim_id, v_actor, now())
  on conflict (device_id) do update
    set sim_id = excluded.sim_id,
        bound_by = excluded.bound_by,
        bound_at = excluded.bound_at;

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
    'gateway.sim_bound',
    'gateway_device',
    p_device_id::text,
    jsonb_build_object(
      'sim_id', p_sim_id,
      'subscription_id', v_sim.subscription_id,
      'slot_index', v_sim.slot_index,
      'carrier_name', v_sim.carrier_name
    )
  );
end;
$$;

create or replace function public.clear_gateway_device_sim_binding(
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
  v_old_sim_id uuid;
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
  for update;

  if v_device.id is null then
    raise exception 'Gateway device not found' using errcode = 'P0002';
  end if;

  delete from public.gateway_device_sim_bindings b
  where b.device_id = p_device_id
  returning b.sim_id into v_old_sim_id;

  if v_old_sim_id is not null then
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
      'gateway.sim_unbound',
      'gateway_device',
      p_device_id::text,
      jsonb_build_object('sim_id', v_old_sim_id)
    );
  end if;
end;
$$;

-- Browser clients use scoped dashboard/binding RPCs. Android inventory reporting
-- is intentionally callable by anon/authenticated because the device credential
-- is the scoped bearer capability; the function re-verifies it before writes.
revoke all on function public.report_gateway_device_inventory(uuid, text, jsonb, jsonb) from public;
revoke all on function public.list_gateway_device_dashboard(uuid) from public, anon;
revoke all on function public.bind_gateway_device_sim(uuid, uuid, uuid) from public, anon;
revoke all on function public.clear_gateway_device_sim_binding(uuid, uuid) from public, anon;

grant execute on function public.report_gateway_device_inventory(uuid, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.list_gateway_device_dashboard(uuid) to authenticated;
grant execute on function public.bind_gateway_device_sim(uuid, uuid, uuid) to authenticated;
grant execute on function public.clear_gateway_device_sim_binding(uuid, uuid) to authenticated;

update public.app_meta
set value = jsonb_build_object('version', '0.7.0', 'phase', 'device_dashboard_sim_binding'),
    updated_at = now()
where key = 'schema';

commit;
