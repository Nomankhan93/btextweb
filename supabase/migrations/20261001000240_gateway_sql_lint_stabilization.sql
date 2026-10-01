begin;

-- BulkText Individual-First gateway SQL lint stabilization.
--
-- 1. Remove the explicit v_attempt declaration because a PL/pgSQL integer
--    FOR loop creates its own loop variable.
-- 2. Use the named unique constraint for SIM upsert conflict handling so
--    RETURNS TABLE output variable device_id cannot collide with the
--    gateway_device_sims.device_id conflict target.
--
-- No product behavior or authorization semantics are changed.

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
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Personal workspace owner permission required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.gateway_devices d
    where d.organization_id = p_organization_id
      and d.status = 'active'
  ) then
    raise exception 'An active gateway phone is already paired. Revoke it before pairing another phone.' using errcode = '23505';
  end if;

  -- Keep at most one currently-usable pairing session for the personal workspace.
  update public.gateway_pairing_codes
  set revoked_at = now()
  where organization_id = p_organization_id
    and claimed_at is null
    and revoked_at is null
    and expires_at > now();

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
  update public.gateway_device_sims as s
  set present = false
  where s.device_id = p_device_id
    and s.present;

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
    on conflict on constraint gateway_device_sims_device_id_subscription_id_key do update
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

commit;
