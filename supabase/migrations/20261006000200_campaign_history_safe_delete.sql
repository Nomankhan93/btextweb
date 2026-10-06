begin;

-- BulkText 0.18.2 — safe campaign/history deletion.
--
-- A campaign may be removed only when deleting its cloud history cannot race
-- with an Android execution or callback/recovery workflow. Queued jobs that
-- have never been leased/downloaded may be cancelled by deletion. Leased or
-- downloaded jobs without a terminal attempt, in-flight attempts, unresolved
-- UNKNOWN attempts, pending recovery, and SENT attempts awaiting possible
-- delivery callbacks block deletion.

create or replace function public.campaign_delete_block_reason_internal(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.campaign_message_recovery_requests r
    where r.organization_id = p_organization_id
      and r.campaign_id = p_campaign_id
      and (
        r.applied_at is null
        or (r.action = 'safe_retry' and r.consumed_at is null)
      )
  ) then
    return 'Recovery is still pending on the paired Android gateway.';
  end if;

  if exists (
    select 1
    from public.campaign_message_attempts a
    where a.organization_id = p_organization_id
      and a.campaign_id = p_campaign_id
      and (
        a.state in ('prepared', 'submitted', 'sent')
        or (a.state = 'unknown' and a.resolved_at is null)
      )
  ) then
    return 'SMS execution or callback reconciliation is still in progress.';
  end if;

  if exists (
    select 1
    from public.campaign_message_jobs j
    where j.organization_id = p_organization_id
      and j.campaign_id = p_campaign_id
      and j.state = 'leased'
  ) then
    return 'Android currently holds a lease for one or more campaign jobs.';
  end if;

  if exists (
    select 1
    from public.campaign_message_jobs j
    where j.organization_id = p_organization_id
      and j.campaign_id = p_campaign_id
      and j.state = 'downloaded'
      and not exists (
        select 1
        from public.campaign_message_attempts a
        where a.job_id = j.id
          and (
            a.state in ('delivered', 'failed')
            or (a.state = 'unknown' and a.resolved_at is not null)
          )
      )
  ) then
    return 'Android has downloaded one or more jobs that are not safely terminal yet.';
  end if;

  return null;
end;
$$;

create or replace function public.get_campaign_delete_status(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table(can_delete boolean, block_reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.organization_id = p_organization_id
  ) then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  v_reason := public.campaign_delete_block_reason_internal(p_organization_id, p_campaign_id);
  return query select v_reason is null, v_reason;
end;
$$;

create or replace function public.delete_campaign(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_campaign public.campaigns%rowtype;
  v_reason text;
  v_queued integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;

  select c.* into v_campaign
  from public.campaigns c
  where c.id = p_campaign_id and c.organization_id = p_organization_id
  for update;

  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  v_reason := public.campaign_delete_block_reason_internal(p_organization_id, p_campaign_id);
  if v_reason is not null then
    raise exception 'Campaign cannot be deleted: %', v_reason using errcode = '22023';
  end if;

  select count(*)::integer into v_queued
  from public.campaign_message_jobs j
  where j.organization_id = p_organization_id
    and j.campaign_id = p_campaign_id
    and j.state = 'queued';

  -- Deleting dispatches first intentionally cascades queue jobs/events,
  -- attempts/parts/events and recovery rows. The campaign snapshot then
  -- cascades recipients and send authorizations.
  delete from public.campaign_dispatches d
  where d.organization_id = p_organization_id and d.campaign_id = p_campaign_id;

  delete from public.campaigns c
  where c.organization_id = p_organization_id and c.id = p_campaign_id;

  insert into public.audit_logs(
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id,
    v_actor,
    'campaign.deleted',
    'campaign',
    p_campaign_id::text,
    jsonb_build_object(
      'title', v_campaign.title,
      'recipientCount', v_campaign.recipient_count,
      'cancelledQueuedJobs', v_queued,
      'deletionPolicy', 'safe-terminal-or-never-downloaded-v1'
    )
  );

  return jsonb_build_object(
    'campaignId', p_campaign_id,
    'title', v_campaign.title,
    'cancelledQueuedJobs', v_queued
  );
end;
$$;

create or replace function public.delete_campaign_history(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_campaign record;
  v_reason text;
  v_deleted integer := 0;
  v_skipped integer := 0;
  v_cancelled integer := 0;
  v_queued integer := 0;
  v_skipped_items jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;

  for v_campaign in
    select c.id, c.title, c.recipient_count
    from public.campaigns c
    where c.organization_id = p_organization_id
    order by c.confirmed_at, c.id
  loop
    v_reason := public.campaign_delete_block_reason_internal(p_organization_id, v_campaign.id);
    if v_reason is not null then
      v_skipped := v_skipped + 1;
      v_skipped_items := v_skipped_items || jsonb_build_array(jsonb_build_object(
        'campaignId', v_campaign.id,
        'title', v_campaign.title,
        'reason', v_reason
      ));
      continue;
    end if;

    select count(*)::integer into v_queued
    from public.campaign_message_jobs j
    where j.organization_id = p_organization_id
      and j.campaign_id = v_campaign.id
      and j.state = 'queued';

    delete from public.campaign_dispatches d
    where d.organization_id = p_organization_id and d.campaign_id = v_campaign.id;

    delete from public.campaigns c
    where c.organization_id = p_organization_id and c.id = v_campaign.id;

    v_deleted := v_deleted + 1;
    v_cancelled := v_cancelled + v_queued;

    insert into public.audit_logs(
      organization_id, actor_user_id, action, target_type, target_id, metadata
    ) values (
      p_organization_id,
      v_actor,
      'campaign.deleted',
      'campaign',
      v_campaign.id::text,
      jsonb_build_object(
        'title', v_campaign.title,
        'recipientCount', v_campaign.recipient_count,
        'cancelledQueuedJobs', v_queued,
        'bulkHistoryCleanup', true,
        'deletionPolicy', 'safe-terminal-or-never-downloaded-v1'
      )
    );
  end loop;

  return jsonb_build_object(
    'deletedCount', v_deleted,
    'skippedCount', v_skipped,
    'cancelledQueuedJobs', v_cancelled,
    'skipped', v_skipped_items
  );
end;
$$;

revoke all on function public.campaign_delete_block_reason_internal(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_campaign_delete_status(uuid,uuid) from public, anon;
revoke all on function public.delete_campaign(uuid,uuid) from public, anon;
revoke all on function public.delete_campaign_history(uuid) from public, anon;

grant execute on function public.campaign_delete_block_reason_internal(uuid,uuid) to service_role;
grant execute on function public.get_campaign_delete_status(uuid,uuid) to authenticated, service_role;
grant execute on function public.delete_campaign(uuid,uuid) to authenticated, service_role;
grant execute on function public.delete_campaign_history(uuid) to authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.18.2',
  'phase', 'safe_campaign_history_delete',
  'campaign_delete_enabled', true,
  'campaign_history_cleanup_enabled', true,
  'campaign_delete_blocks_inflight_android_work', true
),
updated_at = now()
where key = 'schema';

commit;
