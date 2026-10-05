begin;

-- BulkText 0.15 — Gateway Preflight & Send Authorization
--
-- Creates a server-authoritative safety boundary between an immutable campaign
-- snapshot and the future durable queue. This migration does NOT create queue
-- jobs and does NOT send SMS.

create table public.campaign_send_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  gateway_device_id uuid not null references public.gateway_devices(id) on delete restrict,
  gateway_sim_id uuid not null references public.gateway_device_sims(id) on delete restrict,
  sim_subscription_id integer not null check (sim_subscription_id >= 0),
  sim_slot_index integer not null check (sim_slot_index between 0 and 7),
  sim_identity_hash text,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  preflight_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > authorized_at),
  check (expires_at <= authorized_at + interval '5 minutes 5 seconds'),
  check (sim_identity_hash is null or sim_identity_hash ~ '^[0-9a-f]{64}$'),
  check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or
    (revoked_at is not null and revocation_reason is not null)
  )
);

create index campaign_send_authorizations_org_campaign_idx
on public.campaign_send_authorizations (organization_id, campaign_id, authorized_at desc);

-- At most one non-revoked authorization exists for a campaign. Expired rows are
-- explicitly superseded/revoked before a new authorization is inserted.
create unique index campaign_send_authorizations_one_open_idx
on public.campaign_send_authorizations (campaign_id)
where revoked_at is null;

alter table public.campaign_send_authorizations enable row level security;

create policy "campaign_send_authorizations_select_owner"
on public.campaign_send_authorizations
for select
to authenticated
using (public.is_org_member(organization_id));

revoke all on table public.campaign_send_authorizations from public, anon, authenticated;
grant select on table public.campaign_send_authorizations to authenticated;
grant all on table public.campaign_send_authorizations to service_role;

create or replace function public.campaign_send_preflight_internal(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table(
  ready boolean,
  status text,
  blocker_codes text[],
  blockers text[],
  server_time timestamptz,
  campaign_id uuid,
  gateway_device_id uuid,
  gateway_sim_id uuid,
  current_subscription_id integer,
  current_slot_index integer,
  current_sim_identity_hash text,
  device_last_seen_at timestamptz,
  inventory_last_seen_at timestamptz,
  credential_expires_at timestamptz,
  recipient_count integer,
  current_eligible_recipients integer,
  blocked_recipients integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_campaign public.campaigns%rowtype;
  v_device public.gateway_devices%rowtype;
  v_sim public.gateway_device_sims%rowtype;
  v_bound_sim_id uuid;
  v_credential_expires_at timestamptz;
  v_blocker_codes text[] := array[]::text[];
  v_blockers text[] := array[]::text[];
  v_row_count integer := 0;
  v_total_units integer := 0;
  v_gsm_count integer := 0;
  v_unicode_count integer := 0;
  v_min_segments integer := 0;
  v_max_segments integer := 0;
  v_current_eligible integer := 0;
  v_blocked integer := 0;
  v_suppressed integer := 0;
  v_consent_blocked integer := 0;
begin
  select c.*
    into v_campaign
  from public.campaigns c
  where c.id = p_campaign_id
    and c.organization_id = p_organization_id;

  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  if v_campaign.confirmed_at is null then
    v_blocker_codes := array_append(v_blocker_codes, 'campaign_not_confirmed');
    v_blockers := array_append(v_blockers, 'The campaign is not confirmed.');
  end if;

  select
    count(*)::integer,
    coalesce(sum(r.segment_count), 0)::integer,
    count(*) filter (where r.sms_encoding = 'GSM-7')::integer,
    count(*) filter (where r.sms_encoding = 'Unicode')::integer,
    coalesce(min(r.segment_count), 0)::integer,
    coalesce(max(r.segment_count), 0)::integer
  into
    v_row_count,
    v_total_units,
    v_gsm_count,
    v_unicode_count,
    v_min_segments,
    v_max_segments
  from public.campaign_recipients r
  where r.campaign_id = v_campaign.id
    and r.organization_id = v_campaign.organization_id;

  if v_campaign.recipient_count <= 0 then
    v_blocker_codes := array_append(v_blocker_codes, 'campaign_empty');
    v_blockers := array_append(v_blockers, 'The confirmed campaign has no recipients.');
  end if;

  if v_row_count <> v_campaign.recipient_count
     or v_total_units <> v_campaign.estimated_sms_units
     or v_gsm_count <> v_campaign.gsm7_recipients
     or v_unicode_count <> v_campaign.unicode_recipients
     or v_min_segments <> v_campaign.minimum_segments
     or v_max_segments <> v_campaign.maximum_segments then
    v_blocker_codes := array_append(v_blocker_codes, 'campaign_snapshot_integrity');
    v_blockers := array_append(v_blockers, 'The immutable campaign snapshot failed its integrity check.');
  end if;

  select d.*
    into v_device
  from public.gateway_devices d
  where d.id = v_campaign.gateway_device_id_snapshot
    and d.organization_id = v_campaign.organization_id;

  if v_device.id is null or v_device.status <> 'active' then
    v_blocker_codes := array_append(v_blocker_codes, 'device_inactive');
    v_blockers := array_append(v_blockers, 'The confirmed Android phone is no longer active.');
  else
    if v_device.last_seen_at is null or v_device.last_seen_at < v_now - interval '5 minutes' then
      v_blocker_codes := array_append(v_blocker_codes, 'device_not_recent');
      v_blockers := array_append(v_blockers, 'The confirmed Android phone has not been seen recently. Open the gateway app and refresh.');
    end if;

    if v_device.last_inventory_at is null or v_device.last_inventory_at < v_now - interval '5 minutes' then
      v_blocker_codes := array_append(v_blocker_codes, 'inventory_stale');
      v_blockers := array_append(v_blockers, 'The phone/SIM inventory is stale. Refresh the Android gateway inventory.');
    end if;

    select gc.expires_at
      into v_credential_expires_at
    from public.gateway_device_credentials gc
    where gc.device_id = v_device.id
      and gc.version = v_device.credential_version
      and gc.revoked_at is null
    order by gc.version desc
    limit 1;

    if v_credential_expires_at is null or v_credential_expires_at <= v_now then
      v_blocker_codes := array_append(v_blocker_codes, 'credential_invalid');
      v_blockers := array_append(v_blockers, 'The Android gateway credential is missing, expired or revoked.');
    end if;

    select b.sim_id
      into v_bound_sim_id
    from public.gateway_device_sim_bindings b
    where b.device_id = v_device.id;

    if v_bound_sim_id is null then
      v_blocker_codes := array_append(v_blocker_codes, 'sim_unbound');
      v_blockers := array_append(v_blockers, 'No SIM is currently selected for the confirmed Android phone.');
    elsif v_bound_sim_id <> v_campaign.gateway_sim_id_snapshot then
      v_blocker_codes := array_append(v_blocker_codes, 'sim_binding_changed');
      v_blockers := array_append(v_blockers, 'The Web-selected SIM binding changed after campaign confirmation. Reconfirm the campaign before sending.');
    end if;

    select s.*
      into v_sim
    from public.gateway_device_sims s
    where s.id = v_campaign.gateway_sim_id_snapshot
      and s.device_id = v_device.id;

    if v_sim.id is null or not v_sim.present then
      v_blocker_codes := array_append(v_blocker_codes, 'sim_missing');
      v_blockers := array_append(v_blockers, 'The exact SIM confirmed for this campaign is missing. BulkText will not fall back to another SIM.');
    else
      if v_sim.subscription_id <> v_campaign.sim_subscription_id then
        v_blocker_codes := array_append(v_blocker_codes, 'subscription_changed');
        v_blockers := array_append(v_blockers, 'The confirmed SIM subscription ID changed. Reconfirm the campaign before sending.');
      end if;

      if v_sim.slot_index <> v_campaign.sim_slot_index then
        v_blocker_codes := array_append(v_blocker_codes, 'slot_changed');
        v_blockers := array_append(v_blockers, 'The confirmed SIM slot changed. Reconfirm the campaign before sending.');
      end if;

      if v_campaign.sim_identity_hash is null or v_sim.sim_identity_hash is null then
        v_blocker_codes := array_append(v_blocker_codes, 'sim_identity_unverifiable');
        v_blockers := array_append(v_blockers, 'The exact SIM identity cannot be verified. Refresh Android inventory and reconfirm the campaign before sending.');
      elsif v_sim.sim_identity_hash is distinct from v_campaign.sim_identity_hash then
        v_blocker_codes := array_append(v_blocker_codes, 'sim_identity_changed');
        v_blockers := array_append(v_blockers, 'The confirmed SIM identity changed. Reconfirm the campaign before sending.');
      end if;
    end if;
  end if;

  select
    count(*) filter (where compliance.eligibility_state = 'eligible')::integer,
    count(*) filter (where compliance.eligibility_state <> 'eligible')::integer,
    count(*) filter (where compliance.suppression_state = 'suppressed')::integer,
    count(*) filter (
      where compliance.suppression_state <> 'suppressed'
        and compliance.consent_state <> 'granted'
    )::integer
  into
    v_current_eligible,
    v_blocked,
    v_suppressed,
    v_consent_blocked
  from public.campaign_recipients r
  cross join lateral public.contact_compliance_state_internal(
    v_campaign.organization_id,
    r.normalized_e164
  ) compliance
  where r.campaign_id = v_campaign.id
    and r.organization_id = v_campaign.organization_id;

  if v_blocked > 0 then
    v_blocker_codes := array_append(v_blocker_codes, 'recipient_eligibility_changed');
    v_blockers := array_append(
      v_blockers,
      format(
        '%s recipient(s) are no longer eligible (%s suppressed, %s without current consent). Current suppression overrides older campaign evidence.',
        v_blocked,
        v_suppressed,
        v_consent_blocked
      )
    );
  end if;

  ready := cardinality(v_blocker_codes) = 0;
  status := case when ready then 'ready' else 'blocked' end;
  blocker_codes := v_blocker_codes;
  blockers := v_blockers;
  server_time := v_now;
  campaign_id := v_campaign.id;
  gateway_device_id := v_campaign.gateway_device_id_snapshot;
  gateway_sim_id := v_campaign.gateway_sim_id_snapshot;
  current_subscription_id := v_sim.subscription_id;
  current_slot_index := v_sim.slot_index;
  current_sim_identity_hash := v_sim.sim_identity_hash;
  device_last_seen_at := v_device.last_seen_at;
  inventory_last_seen_at := v_device.last_inventory_at;
  credential_expires_at := v_credential_expires_at;
  recipient_count := v_campaign.recipient_count;
  current_eligible_recipients := v_current_eligible;
  blocked_recipients := v_blocked;
  return next;
end;
$$;

create or replace function public.get_campaign_send_preflight(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table(
  ready boolean,
  status text,
  blocker_codes text[],
  blockers text[],
  server_time timestamptz,
  campaign_id uuid,
  gateway_device_id uuid,
  gateway_sim_id uuid,
  current_subscription_id integer,
  current_slot_index integer,
  current_sim_identity_hash text,
  device_last_seen_at timestamptz,
  inventory_last_seen_at timestamptz,
  credential_expires_at timestamptz,
  recipient_count integer,
  current_eligible_recipients integer,
  blocked_recipients integer
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
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;

  return query
  select *
  from public.campaign_send_preflight_internal(p_organization_id, p_campaign_id);
end;
$$;

create or replace function public.authorize_campaign_send(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table(
  authorization_id uuid,
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  status text,
  gateway_device_id uuid,
  gateway_sim_id uuid,
  sim_subscription_id integer,
  sim_slot_index integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_campaign public.campaigns%rowtype;
  v_preflight record;
  v_authorization_id uuid;
  v_expires_at timestamptz := v_now + interval '5 minutes';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Personal workspace owner permission required to authorize sending' using errcode = '42501';
  end if;

  select c.*
    into v_campaign
  from public.campaigns c
  where c.id = p_campaign_id
    and c.organization_id = p_organization_id
  for update;

  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  select *
    into v_preflight
  from public.campaign_send_preflight_internal(p_organization_id, p_campaign_id);

  if not coalesce(v_preflight.ready, false) then
    raise exception 'Campaign send authorization blocked: %', array_to_string(v_preflight.blockers, ' | ')
      using errcode = '22023';
  end if;

  -- Serializing on the campaign row plus this revocation step keeps authorization
  -- creation idempotent under double-clicks/two browser tabs without creating a queue.
  update public.campaign_send_authorizations a
  set revoked_at = v_now,
      revoked_by = v_actor,
      revocation_reason = 'superseded'
  where a.organization_id = p_organization_id
    and a.campaign_id = p_campaign_id
    and a.revoked_at is null;

  insert into public.campaign_send_authorizations (
    organization_id,
    campaign_id,
    gateway_device_id,
    gateway_sim_id,
    sim_subscription_id,
    sim_slot_index,
    sim_identity_hash,
    authorized_by,
    authorized_at,
    expires_at,
    preflight_snapshot
  ) values (
    p_organization_id,
    p_campaign_id,
    v_campaign.gateway_device_id_snapshot,
    v_campaign.gateway_sim_id_snapshot,
    v_campaign.sim_subscription_id,
    v_campaign.sim_slot_index,
    v_campaign.sim_identity_hash,
    v_actor,
    v_now,
    v_expires_at,
    jsonb_build_object(
      'status', v_preflight.status,
      'serverTime', v_preflight.server_time,
      'deviceLastSeenAt', v_preflight.device_last_seen_at,
      'inventoryLastSeenAt', v_preflight.inventory_last_seen_at,
      'credentialExpiresAt', v_preflight.credential_expires_at,
      'recipientCount', v_preflight.recipient_count,
      'eligibleRecipients', v_preflight.current_eligible_recipients,
      'blockedRecipients', v_preflight.blocked_recipients,
      'gatewayDeviceId', v_campaign.gateway_device_id_snapshot,
      'gatewaySimId', v_campaign.gateway_sim_id_snapshot,
      'subscriptionId', v_campaign.sim_subscription_id,
      'slotIndex', v_campaign.sim_slot_index,
      'simIdentityHash', v_campaign.sim_identity_hash
    )
  )
  returning id into v_authorization_id;

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
    'campaign.send_authorized',
    'campaign_send_authorization',
    v_authorization_id::text,
    jsonb_build_object(
      'campaignId', p_campaign_id,
      'expiresAt', v_expires_at,
      'gatewayDeviceId', v_campaign.gateway_device_id_snapshot,
      'gatewaySimId', v_campaign.gateway_sim_id_snapshot,
      'subscriptionId', v_campaign.sim_subscription_id,
      'slotIndex', v_campaign.sim_slot_index
    )
  );

  authorization_id := v_authorization_id;
  authorized_at := v_now;
  expires_at := v_expires_at;
  revoked_at := null;
  revocation_reason := null;
  status := 'authorized';
  gateway_device_id := v_campaign.gateway_device_id_snapshot;
  gateway_sim_id := v_campaign.gateway_sim_id_snapshot;
  sim_subscription_id := v_campaign.sim_subscription_id;
  sim_slot_index := v_campaign.sim_slot_index;
  return next;
end;
$$;

create or replace function public.get_latest_campaign_send_authorization(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table(
  authorization_id uuid,
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  status text,
  gateway_device_id uuid,
  gateway_sim_id uuid,
  sim_subscription_id integer,
  sim_slot_index integer
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
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.campaigns c
    where c.id = p_campaign_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  return query
  select
    a.id,
    a.authorized_at,
    a.expires_at,
    a.revoked_at,
    a.revocation_reason,
    case
      when a.revoked_at is not null then 'revoked'
      when a.expires_at <= now() then 'expired'
      else 'authorized'
    end,
    a.gateway_device_id,
    a.gateway_sim_id,
    a.sim_subscription_id,
    a.sim_slot_index
  from public.campaign_send_authorizations a
  where a.organization_id = p_organization_id
    and a.campaign_id = p_campaign_id
  order by a.authorized_at desc, a.id desc
  limit 1;
end;
$$;

create or replace function public.revoke_campaign_send_authorization(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_authorization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Personal workspace owner permission required to revoke send authorization' using errcode = '42501';
  end if;

  update public.campaign_send_authorizations a
  set revoked_at = now(),
      revoked_by = v_actor,
      revocation_reason = 'user_revoked'
  where a.id = p_authorization_id
    and a.organization_id = p_organization_id
    and a.campaign_id = p_campaign_id
    and a.revoked_at is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

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
    'campaign.send_authorization_revoked',
    'campaign_send_authorization',
    p_authorization_id::text,
    jsonb_build_object('campaignId', p_campaign_id)
  );

  return true;
end;
$$;

revoke all on function public.campaign_send_preflight_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_campaign_send_preflight(uuid, uuid) from public, anon;
revoke all on function public.authorize_campaign_send(uuid, uuid) from public, anon;
revoke all on function public.get_latest_campaign_send_authorization(uuid, uuid) from public, anon;
revoke all on function public.revoke_campaign_send_authorization(uuid, uuid, uuid) from public, anon;

grant execute on function public.campaign_send_preflight_internal(uuid, uuid) to service_role;
grant execute on function public.get_campaign_send_preflight(uuid, uuid) to authenticated, service_role;
grant execute on function public.authorize_campaign_send(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_latest_campaign_send_authorization(uuid, uuid) to authenticated, service_role;
grant execute on function public.revoke_campaign_send_authorization(uuid, uuid, uuid) to authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.15.0',
  'phase', 'gateway_preflight_send_authorization',
  'gateway_preflight_enabled', true,
  'campaign_send_authorization_enabled', true,
  'campaign_send_authorization_ttl_seconds', 300,
  'exact_sim_preflight_required', true,
  'campaign_send_enabled', false,
  'queue_enabled', false
),
updated_at = now()
where key = 'schema';

commit;
