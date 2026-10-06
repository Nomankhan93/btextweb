begin;

-- BulkText 0.18.1
-- Real-device acceptance showed that a non-success Android SENT callback can occur
-- even when the handset/network still delivers the SMS. Therefore SENT callback
-- failure after SmsManager is ambiguous evidence, not proof of zero external effect.
-- This migration removes the unsafe callback-derived safe-retry path.

create or replace function public.refresh_campaign_message_attempt_state_internal(
  p_attempt_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.campaign_message_attempts%rowtype;
  v_sent_ok integer := 0;
  v_sent_failed integer := 0;
  v_sent_pending integer := 0;
  v_delivery_ok integer := 0;
  v_now timestamptz := now();
begin
  select a.* into v_attempt
  from public.campaign_message_attempts a
  where a.id = p_attempt_id
  for update;

  if v_attempt.id is null then
    raise exception 'Message attempt not found' using errcode = 'P0002';
  end if;

  select
    count(*) filter (where p.sent_state = 'sent'),
    count(*) filter (where p.sent_state = 'failed'),
    count(*) filter (where p.sent_state = 'pending'),
    count(*) filter (where p.delivery_state = 'delivered')
  into v_sent_ok, v_sent_failed, v_sent_pending, v_delivery_ok
  from public.campaign_message_attempt_parts p
  where p.attempt_id = p_attempt_id;

  if v_sent_ok = v_attempt.expected_parts then
    if v_delivery_ok = v_attempt.expected_parts then
      update public.campaign_message_attempts a
      set state = 'delivered',
          safe_retry_eligible = false,
          sent_at = coalesce(a.sent_at, v_now),
          delivered_at = coalesce(a.delivered_at, v_now),
          terminal_reason = null
      where a.id = p_attempt_id;
    else
      update public.campaign_message_attempts a
      set state = 'sent',
          safe_retry_eligible = false,
          sent_at = coalesce(a.sent_at, v_now),
          terminal_reason = case
            when a.state = 'unknown' then 'Late complete SENT callbacks resolved the prior ambiguity.'
            else a.terminal_reason
          end
      where a.id = p_attempt_id;
    end if;
    return;
  end if;

  -- 0.18.1 safety rule: once SENT callbacks exist, SmsManager was already invoked.
  -- Even if every callback reports failure, real-device acceptance proved that
  -- delivery may still occur. The external effect is therefore ambiguous and
  -- must never be represented as safely retryable.
  if v_sent_pending = 0 and v_sent_failed > 0 then
    update public.campaign_message_attempts a
    set state = 'unknown',
        safe_retry_eligible = false,
        unknown_at = coalesce(a.unknown_at, v_now),
        terminal_reason = case
          when v_sent_ok > 0 then
            'Multipart SENT callbacks were mixed success/failure; resend could duplicate successful parts.'
          else
            'All SENT callbacks reported failure after SmsManager. Real-device delivery can still occur, so resend is unsafe without proof of zero external effect.'
        end
    where a.id = p_attempt_id;

    update public.campaign_message_recovery_requests r
    set consumed_at = coalesce(r.consumed_at, v_now)
    where r.attempt_id = p_attempt_id
      and r.action = 'safe_retry'
      and r.consumed_at is null;
    return;
  end if;
end;
$$;

-- Reclassify 0.18 callback-derived FAILED attempts. 00340 only created FAILED
-- from an all-failed SENT callback set, which is post-SmsManager evidence and is
-- not safe enough to authorize another external SMS effect.
update public.campaign_message_attempts a
set state = 'unknown',
    safe_retry_eligible = false,
    unknown_at = coalesce(a.unknown_at, a.failed_at, now()),
    terminal_reason = '0.18.1 safety reclassification: prior all-failed SENT callbacks do not prove zero SMS submission; resend is disabled.'
where a.state = 'failed';

update public.campaign_message_recovery_requests r
set consumed_at = coalesce(r.consumed_at, now())
where r.action = 'safe_retry'
  and r.consumed_at is null;

-- Defense in depth for old Web clients: 0.18.1 does not permit creation of
-- callback-derived safe-retry requests. UNKNOWN may only be resolved by
-- continuing without resending the ambiguous recipient.
create or replace function public.request_campaign_message_recovery(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_action text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_org_member(p_organization_id) then
    raise exception 'Personal workspace access required' using errcode = '42501';
  end if;

  if p_action = 'safe_retry' then
    raise exception 'Safe retry is disabled in 0.18.1: post-SmsManager callback failure cannot prove zero external SMS effect' using errcode = '22023';
  end if;
  if p_action <> 'skip_unknown' then
    raise exception 'Unsupported recovery action' using errcode = '22023';
  end if;

  with latest as (
    select distinct on (a.job_id) a.*
    from public.campaign_message_attempts a
    where a.organization_id = p_organization_id and a.campaign_id = p_campaign_id
    order by a.job_id, a.attempt_number desc
  ), candidates as (
    select l.*
    from latest l
    where l.state = 'unknown' and l.resolved_at is null
  )
  insert into public.campaign_message_recovery_requests (
    organization_id, campaign_id, dispatch_id, job_id, attempt_id, gateway_device_id,
    action, requested_by
  )
  select c.organization_id, c.campaign_id, c.dispatch_id, c.job_id, c.id, c.gateway_device_id,
         'skip_unknown', v_actor
  from candidates c
  on conflict (attempt_id, action) do nothing;

  get diagnostics v_count = row_count;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id, v_actor, 'campaign.message_recovery_requested', 'campaign', p_campaign_id::text,
    jsonb_build_object('recoveryAction', 'skip_unknown', 'requestCount', v_count, 'safeRetryDisabled', true)
  );

  return v_count;
end;
$$;

revoke all on function public.refresh_campaign_message_attempt_state_internal(uuid) from public, anon, authenticated;
grant execute on function public.refresh_campaign_message_attempt_state_internal(uuid) to service_role;

revoke all on function public.request_campaign_message_recovery(uuid,uuid,text) from public, anon;
grant execute on function public.request_campaign_message_recovery(uuid,uuid,text) to authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.18.1',
  'phase', 'callback_retry_safety_stabilization',
  'safe_retry_requires_explicit_web_request', true,
  'safe_retry_requires_zero_successful_sent_parts', true,
  'post_smsmanager_callback_failure_is_unknown', true,
  'callback_derived_safe_retry_enabled', false,
  'unknown_auto_retry_enabled', false,
  'unknown_skip_without_resend_enabled', true
),
updated_at = now()
where key = 'schema';

commit;
