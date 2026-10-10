begin;

-- BulkText 0.18.3 — development/test campaign purge.
--
-- This is intentionally stronger than normal campaign deletion and is meant
-- only for cleaning a development workspace after acceptance testing.
-- It removes campaign/dispatch/queue/attempt/recovery data for the current
-- personal workspace while preserving identity, pairing, SIM binding,
-- consent/suppression, imports, message drafts, and audit history.
--
-- Android keeps its own durable local queue. After a purge, reset only the
-- Android cloud_queue.db (not app data) before starting fresh acceptance tests.

create or replace function public.get_test_campaign_purge_status(
  p_organization_id uuid
)
returns table(
  campaign_count integer,
  dispatch_count integer,
  job_count integer,
  queued_job_count integer,
  leased_job_count integer,
  downloaded_job_count integer,
  attempt_count integer,
  unresolved_unknown_count integer,
  pending_recovery_count integer
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
  select
    (select count(*)::integer from public.campaigns c where c.organization_id = p_organization_id),
    (select count(*)::integer from public.campaign_dispatches d where d.organization_id = p_organization_id),
    (select count(*)::integer from public.campaign_message_jobs j where j.organization_id = p_organization_id),
    (select count(*)::integer from public.campaign_message_jobs j where j.organization_id = p_organization_id and j.state = 'queued'),
    (select count(*)::integer from public.campaign_message_jobs j where j.organization_id = p_organization_id and j.state = 'leased'),
    (select count(*)::integer from public.campaign_message_jobs j where j.organization_id = p_organization_id and j.state = 'downloaded'),
    (select count(*)::integer from public.campaign_message_attempts a where a.organization_id = p_organization_id),
    (select count(*)::integer from public.campaign_message_attempts a where a.organization_id = p_organization_id and a.state = 'unknown' and a.resolved_at is null),
    (select count(*)::integer from public.campaign_message_recovery_requests r where r.organization_id = p_organization_id and (r.applied_at is null or r.consumed_at is null));
end;
$$;

create or replace function public.purge_test_campaign_data(
  p_organization_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_campaigns integer := 0;
  v_dispatches integer := 0;
  v_jobs integer := 0;
  v_attempts integer := 0;
  v_unknown integer := 0;
  v_recovery integer := 0;
  v_recipients integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;
  if coalesce(p_confirmation, '') <> 'PURGE TEST CAMPAIGNS' then
    raise exception 'Type PURGE TEST CAMPAIGNS exactly to confirm the development purge.' using errcode = '22023';
  end if;

  -- Freeze campaign/queue mutation while the test purge runs. This is a short
  -- development-only operation and deliberately wins races with queue claims,
  -- callbacks and recovery requests.
  lock table public.campaigns in share row exclusive mode;
  lock table public.campaign_dispatches in share row exclusive mode;
  lock table public.campaign_message_jobs in share row exclusive mode;
  lock table public.campaign_message_attempts in share row exclusive mode;
  lock table public.campaign_message_recovery_requests in share row exclusive mode;

  select count(*)::integer into v_campaigns
  from public.campaigns c where c.organization_id = p_organization_id;

  select count(*)::integer into v_dispatches
  from public.campaign_dispatches d where d.organization_id = p_organization_id;

  select count(*)::integer into v_jobs
  from public.campaign_message_jobs j where j.organization_id = p_organization_id;

  select count(*)::integer into v_attempts
  from public.campaign_message_attempts a where a.organization_id = p_organization_id;

  select count(*)::integer into v_unknown
  from public.campaign_message_attempts a
  where a.organization_id = p_organization_id and a.state = 'unknown' and a.resolved_at is null;

  select count(*)::integer into v_recovery
  from public.campaign_message_recovery_requests r
  where r.organization_id = p_organization_id and (r.applied_at is null or r.consumed_at is null);

  select count(*)::integer into v_recipients
  from public.campaign_recipients r where r.organization_id = p_organization_id;

  -- Dispatch deletion cascades queue events, jobs, attempts, attempt parts,
  -- callback events and recovery requests. Campaign deletion then cascades
  -- campaign recipients and send authorizations. Device pairing/SIM tables,
  -- consent/suppression, imports and drafts are intentionally untouched.
  delete from public.campaign_dispatches d
  where d.organization_id = p_organization_id;

  delete from public.campaigns c
  where c.organization_id = p_organization_id;

  insert into public.audit_logs(
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id,
    v_actor,
    'test_data.campaigns_purged',
    'workspace',
    p_organization_id::text,
    jsonb_build_object(
      'campaignCount', v_campaigns,
      'dispatchCount', v_dispatches,
      'jobCount', v_jobs,
      'attemptCount', v_attempts,
      'unresolvedUnknownCount', v_unknown,
      'pendingRecoveryCount', v_recovery,
      'recipientCount', v_recipients,
      'preserved', jsonb_build_array(
        'auth', 'workspace', 'gateway_pairing', 'gateway_sim_binding',
        'consent_suppression', 'imports', 'message_drafts', 'audit_logs'
      ),
      'androidLocalQueueResetRequired', true,
      'policy', 'development-test-campaign-purge-v1'
    )
  );

  return jsonb_build_object(
    'campaignCount', v_campaigns,
    'dispatchCount', v_dispatches,
    'jobCount', v_jobs,
    'attemptCount', v_attempts,
    'unresolvedUnknownCount', v_unknown,
    'pendingRecoveryCount', v_recovery,
    'recipientCount', v_recipients,
    'androidLocalQueueResetRequired', true
  );
end;
$$;

revoke all on function public.get_test_campaign_purge_status(uuid) from public, anon;
revoke all on function public.purge_test_campaign_data(uuid,text) from public, anon;
grant execute on function public.get_test_campaign_purge_status(uuid) to authenticated, service_role;
grant execute on function public.purge_test_campaign_data(uuid,text) to authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.18.3',
  'phase', 'test_campaign_cleanup',
  'test_campaign_purge_enabled', true,
  'test_campaign_purge_preserves_pairing', true,
  'android_local_queue_reset_required_after_test_purge', true
),
updated_at = now()
where key = 'schema';

commit;
