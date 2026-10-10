begin;

-- BulkText Web 0.18.4 — Production Safety + Release Hardening
--
-- Forward-only hardening. Historical migration 20261006000210 is retained,
-- but its development purge RPCs are removed from the effective schema.
-- A final current compliance check is enforced at attempt start so a
-- suppression/consent change after enqueue cannot reach SmsManager.

-- Production must not expose a cloud-only destructive purge while Android
-- may retain executable local work. Remove the RPCs entirely from the latest
-- schema instead of relying on a UI confirmation phrase.
drop function if exists public.purge_test_campaign_data(uuid,text);
drop function if exists public.get_test_campaign_purge_status(uuid);

create or replace function public.begin_gateway_message_attempt(
  p_device_id uuid,
  p_credential text,
  p_job_id uuid,
  p_client_attempt_id uuid,
  p_expected_parts integer
)
returns table(
  attempt_id uuid,
  client_attempt_id uuid,
  attempt_number integer,
  state text,
  safe_retry_eligible boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth record;
  v_job public.campaign_message_jobs%rowtype;
  v_dispatch public.campaign_dispatches%rowtype;
  v_existing public.campaign_message_attempts%rowtype;
  v_latest public.campaign_message_attempts%rowtype;
  v_recovery public.campaign_message_recovery_requests%rowtype;
  v_created public.campaign_message_attempts%rowtype;
  v_compliance record;
  v_next integer := 1;
begin
  select * into v_auth
  from public.authenticate_gateway_queue_device_internal(p_device_id, p_credential);

  if p_client_attempt_id is null or p_expected_parts is null or p_expected_parts < 1 then
    raise exception 'Invalid message attempt request' using errcode = '22023';
  end if;

  select j.* into v_job
  from public.campaign_message_jobs j
  join public.campaign_dispatches d on d.id = j.dispatch_id
  where j.id = p_job_id
    and j.organization_id = v_auth.organization_id
    and d.gateway_device_id = p_device_id
  for update of j;

  if v_job.id is null then
    raise exception 'Queue job not found for this gateway device' using errcode = '42501';
  end if;
  if v_job.state <> 'downloaded' or v_job.lease_owner_device_id <> p_device_id then
    raise exception 'Queue job is not durably downloaded by this gateway device' using errcode = '22023';
  end if;
  if v_job.segment_count <> p_expected_parts then
    raise exception 'Attempt part count does not match immutable queue segment count' using errcode = '22023';
  end if;

  select d.* into v_dispatch
  from public.campaign_dispatches d
  where d.id = v_job.dispatch_id;

  perform public.assert_gateway_dispatch_identity_internal(v_job.dispatch_id, p_device_id);

  -- 0.18.4 final compliance gate: suppression/consent can change after
  -- queue creation. Re-check immediately before creating/reusing the
  -- authoritative server attempt. Android calls this before persisting
  -- SUBMITTING and before SmsManager, so rejection remains pre-send.
  select * into v_compliance
  from public.contact_compliance_state_internal(
    v_job.organization_id,
    v_job.normalized_e164
  );

  if v_compliance.eligibility_state is distinct from 'eligible' then
    raise exception 'Recipient is no longer eligible at attempt start; SMS submission is blocked'
      using errcode = '22023',
            detail = coalesce(v_compliance.block_reason, 'Current consent/suppression policy blocks this recipient');
  end if;

  select a.* into v_existing
  from public.campaign_message_attempts a
  where a.client_attempt_id = p_client_attempt_id;

  if v_existing.id is not null then
    if v_existing.job_id <> p_job_id or v_existing.gateway_device_id <> p_device_id or v_existing.expected_parts <> p_expected_parts then
      raise exception 'Client attempt identifier belongs to different immutable work' using errcode = '22023';
    end if;
    attempt_id := v_existing.id;
    client_attempt_id := v_existing.client_attempt_id;
    attempt_number := v_existing.attempt_number;
    state := v_existing.state;
    safe_retry_eligible := v_existing.safe_retry_eligible;
    created_at := v_existing.created_at;
    return next;
    return;
  end if;

  select a.* into v_latest
  from public.campaign_message_attempts a
  where a.job_id = p_job_id
  order by a.attempt_number desc
  limit 1
  for update;

  if v_latest.id is not null then
    if v_latest.state <> 'failed' or v_latest.safe_retry_eligible is not true then
      raise exception 'Queue job already has an attempt that is not safely retryable' using errcode = '22023';
    end if;

    select r.* into v_recovery
    from public.campaign_message_recovery_requests r
    where r.attempt_id = v_latest.id
      and r.action = 'safe_retry'
      and r.gateway_device_id = p_device_id
      and r.applied_at is not null
      and r.consumed_at is null
    order by r.requested_at, r.id
    limit 1
    for update;

    if v_recovery.id is null then
      raise exception 'Safe retry requires an explicit Web recovery request applied by this device' using errcode = '22023';
    end if;
    v_next := v_latest.attempt_number + 1;
  end if;

  insert into public.campaign_message_attempts (
    organization_id, campaign_id, dispatch_id, job_id, gateway_device_id,
    client_attempt_id, attempt_number, expected_parts, state
  ) values (
    v_job.organization_id, v_job.campaign_id, v_job.dispatch_id, v_job.id, p_device_id,
    p_client_attempt_id, v_next, p_expected_parts, 'prepared'
  ) returning * into v_created;

  insert into public.campaign_message_attempt_parts (attempt_id, part_index)
  select v_created.id, gs
  from generate_series(0, p_expected_parts - 1) gs;

  if v_recovery.id is not null then
    update public.campaign_message_recovery_requests r
    set consumed_at = now()
    where r.id = v_recovery.id and r.consumed_at is null;
  end if;

  attempt_id := v_created.id;
  client_attempt_id := v_created.client_attempt_id;
  attempt_number := v_created.attempt_number;
  state := v_created.state;
  safe_retry_eligible := v_created.safe_retry_eligible;
  created_at := v_created.created_at;
  return next;
end;
$$;

revoke all on function public.begin_gateway_message_attempt(uuid,text,uuid,uuid,integer) from public;
grant execute on function public.begin_gateway_message_attempt(uuid,text,uuid,uuid,integer) to anon, authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.18.4',
  'phase', 'production_safety_release_hardening',
  'test_campaign_purge_enabled', false,
  'production_test_purge_removed', true,
  'final_compliance_gate_before_attempt', true,
  'suppression_rechecked_at_attempt_start', true,
  'unknown_auto_retry_enabled', false,
  'callback_derived_safe_retry_enabled', false,
  'release_package_version_source', 'package.json',
  'release_artifact_secret_scan_required', true,
  'release_checksum_regeneration_required', true
),
updated_at = now()
where key = 'schema';

commit;
