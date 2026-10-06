begin;

-- BulkText 0.18 — SENT/DELIVERED callbacks, immutable attempt history,
-- explicit safe retry requests, and UNKNOWN recovery without resend.
--
-- Safety boundaries:
-- * every SmsManager attempt must be registered in cloud before the Android
--   submission boundary;
-- * retries are NEVER automatic and are permitted only after every SENT
--   callback for the previous attempt conclusively failed with zero successful
--   parts;
-- * mixed/ambiguous SENT outcomes are UNKNOWN and cannot be retried here;
-- * resolving UNKNOWN only means "continue without resend";
-- * exact-SIM queue/dispatch rules from 00320 remain unchanged.

create table public.campaign_message_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  dispatch_id uuid not null references public.campaign_dispatches(id) on delete cascade,
  job_id uuid not null references public.campaign_message_jobs(id) on delete cascade,
  gateway_device_id uuid not null references public.gateway_devices(id) on delete restrict,
  client_attempt_id uuid not null unique,
  attempt_number integer not null check (attempt_number > 0),
  expected_parts integer not null check (expected_parts > 0),
  state text not null default 'prepared' check (state in ('prepared','submitted','sent','delivered','failed','unknown')),
  safe_retry_eligible boolean not null default false,
  terminal_reason text,
  submitted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  unknown_at timestamptz,
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('skip_without_retry')),
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create index campaign_message_attempts_campaign_created_idx
on public.campaign_message_attempts (campaign_id, created_at desc, id desc);

create index campaign_message_attempts_job_attempt_idx
on public.campaign_message_attempts (job_id, attempt_number desc);

create table public.campaign_message_attempt_parts (
  attempt_id uuid not null references public.campaign_message_attempts(id) on delete cascade,
  part_index integer not null check (part_index >= 0),
  sent_state text not null default 'pending' check (sent_state in ('pending','sent','failed')),
  sent_result_code integer,
  sent_at timestamptz,
  delivery_state text not null default 'pending' check (delivery_state in ('pending','delivered','failed')),
  delivery_result_code integer,
  delivered_at timestamptz,
  primary key (attempt_id, part_index)
);

create table public.campaign_message_attempt_events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  dispatch_id uuid not null references public.campaign_dispatches(id) on delete cascade,
  job_id uuid not null references public.campaign_message_jobs(id) on delete cascade,
  attempt_id uuid not null references public.campaign_message_attempts(id) on delete cascade,
  actor_device_id uuid not null references public.gateway_devices(id) on delete restrict,
  event_type text not null check (event_type in ('submitted','sent','delivery','unknown')),
  part_index integer,
  result_code integer,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (
    (event_type in ('sent','delivery') and part_index is not null and part_index >= 0 and result_code is not null)
    or
    (event_type in ('submitted','unknown') and part_index is null)
  )
);

create index campaign_message_attempt_events_attempt_received_idx
on public.campaign_message_attempt_events (attempt_id, received_at, id);

create table public.campaign_message_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  dispatch_id uuid not null references public.campaign_dispatches(id) on delete cascade,
  job_id uuid not null references public.campaign_message_jobs(id) on delete cascade,
  attempt_id uuid not null references public.campaign_message_attempts(id) on delete cascade,
  gateway_device_id uuid not null references public.gateway_devices(id) on delete restrict,
  action text not null check (action in ('safe_retry','skip_unknown')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by_device_id uuid references public.gateway_devices(id) on delete restrict,
  consumed_at timestamptz,
  unique (attempt_id, action)
);

create index campaign_message_recovery_device_pending_idx
on public.campaign_message_recovery_requests (gateway_device_id, requested_at, id)
where applied_at is null and consumed_at is null;

alter table public.campaign_message_attempts enable row level security;
alter table public.campaign_message_attempt_parts enable row level security;
alter table public.campaign_message_attempt_events enable row level security;
alter table public.campaign_message_recovery_requests enable row level security;

create policy "campaign_message_attempts_select_owner"
on public.campaign_message_attempts
for select to authenticated
using (public.is_org_member(organization_id));

create policy "campaign_message_attempt_parts_select_owner"
on public.campaign_message_attempt_parts
for select to authenticated
using (
  exists (
    select 1 from public.campaign_message_attempts a
    where a.id = campaign_message_attempt_parts.attempt_id and public.is_org_member(a.organization_id)
  )
);

create policy "campaign_message_attempt_events_select_owner"
on public.campaign_message_attempt_events
for select to authenticated
using (public.is_org_member(organization_id));

create policy "campaign_message_recovery_requests_select_owner"
on public.campaign_message_recovery_requests
for select to authenticated
using (public.is_org_member(organization_id));

revoke all on table public.campaign_message_attempts from public, anon, authenticated;
revoke all on table public.campaign_message_attempt_parts from public, anon, authenticated;
revoke all on table public.campaign_message_attempt_events from public, anon, authenticated;
revoke all on table public.campaign_message_recovery_requests from public, anon, authenticated;

grant select on table public.campaign_message_attempts to authenticated;
grant select on table public.campaign_message_attempt_parts to authenticated;
grant select on table public.campaign_message_attempt_events to authenticated;
grant select on table public.campaign_message_recovery_requests to authenticated;
grant all on table public.campaign_message_attempts to service_role;
grant all on table public.campaign_message_attempt_parts to service_role;
grant all on table public.campaign_message_attempt_events to service_role;
grant all on table public.campaign_message_recovery_requests to service_role;

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

  -- A callback conflict is intentionally sticky UNKNOWN until a later complete
  -- set of successful SENT callbacks proves the entire multipart message sent.
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
          terminal_reason = case when a.state = 'unknown' then 'Late complete SENT callbacks resolved the prior ambiguity.' else a.terminal_reason end
      where a.id = p_attempt_id;
    end if;
    return;
  end if;

  if v_sent_pending = 0 and v_sent_failed = v_attempt.expected_parts then
    update public.campaign_message_attempts a
    set state = 'failed',
        safe_retry_eligible = true,
        failed_at = coalesce(a.failed_at, v_now),
        terminal_reason = 'All SENT callbacks failed and zero parts reported SENT; explicit safe retry is eligible.'
    where a.id = p_attempt_id;
    return;
  end if;

  if v_sent_pending = 0 and v_sent_failed > 0 and v_sent_ok > 0 then
    update public.campaign_message_attempts a
    set state = 'unknown',
        safe_retry_eligible = false,
        unknown_at = coalesce(a.unknown_at, v_now),
        terminal_reason = 'Multipart SENT callbacks were mixed success/failure; resend could duplicate successful parts.'
    where a.id = p_attempt_id;

    -- Any not-yet-consumed safe retry for this attempt is now invalid.
    update public.campaign_message_recovery_requests r
    set consumed_at = coalesce(r.consumed_at, v_now)
    where r.attempt_id = p_attempt_id
      and r.action = 'safe_retry'
      and r.consumed_at is null;
  end if;
end;
$$;

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

create or replace function public.report_gateway_message_attempt_event(
  p_device_id uuid,
  p_credential text,
  p_event_id uuid,
  p_client_attempt_id uuid,
  p_event_type text,
  p_part_index integer default null,
  p_result_code integer default null,
  p_occurred_at_ms bigint default null
)
returns table(
  attempt_id uuid,
  client_attempt_id uuid,
  attempt_number integer,
  state text,
  safe_retry_eligible boolean,
  sent_parts integer,
  failed_sent_parts integer,
  delivered_parts integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth record;
  v_attempt public.campaign_message_attempts%rowtype;
  v_part public.campaign_message_attempt_parts%rowtype;
  v_existing_event public.campaign_message_attempt_events%rowtype;
  v_occurred timestamptz := now();
  v_new_part_state text;
  v_conflict boolean := false;
begin
  select * into v_auth
  from public.authenticate_gateway_queue_device_internal(p_device_id, p_credential);

  if p_event_id is null or p_client_attempt_id is null or p_event_type not in ('submitted','sent','delivery','unknown') then
    raise exception 'Invalid message attempt event' using errcode = '22023';
  end if;
  if p_occurred_at_ms is not null and p_occurred_at_ms > 0 then
    v_occurred := to_timestamp(p_occurred_at_ms::numeric / 1000.0);
  end if;

  select a.* into v_attempt
  from public.campaign_message_attempts a
  where a.client_attempt_id = p_client_attempt_id
    and a.gateway_device_id = p_device_id
    and a.organization_id = v_auth.organization_id
  for update;

  if v_attempt.id is null then
    raise exception 'Message attempt not found for this gateway device' using errcode = '42501';
  end if;

  -- Duplicate event delivery is idempotent only when the immutable payload
  -- matches exactly. Reusing an event UUID for different work is rejected.
  select e.* into v_existing_event
  from public.campaign_message_attempt_events e
  where e.event_id = p_event_id;

  if v_existing_event.id is not null then
    if v_existing_event.attempt_id <> v_attempt.id
       or v_existing_event.actor_device_id <> p_device_id
       or v_existing_event.event_type <> p_event_type
       or v_existing_event.part_index is distinct from p_part_index
       or v_existing_event.result_code is distinct from p_result_code then
      raise exception 'Attempt event id is already bound to a different immutable callback payload' using errcode = '22023';
    end if;
    return query
    select v_attempt.id, v_attempt.client_attempt_id, v_attempt.attempt_number, a.state, a.safe_retry_eligible,
      count(*) filter (where p.sent_state = 'sent')::integer,
      count(*) filter (where p.sent_state = 'failed')::integer,
      count(*) filter (where p.delivery_state = 'delivered')::integer
    from public.campaign_message_attempts a
    join public.campaign_message_attempt_parts p on p.attempt_id = a.id
    where a.id = v_attempt.id
    group by a.id;
    return;
  end if;

  if p_event_type in ('sent','delivery') then
    if p_part_index is null or p_result_code is null or p_part_index < 0 or p_part_index >= v_attempt.expected_parts then
      raise exception 'Invalid multipart callback index or result code' using errcode = '22023';
    end if;
  elsif p_part_index is not null or p_result_code is not null then
    raise exception 'Non-part event must not include part index or result code' using errcode = '22023';
  end if;

  insert into public.campaign_message_attempt_events (
    event_id, organization_id, campaign_id, dispatch_id, job_id, attempt_id,
    actor_device_id, event_type, part_index, result_code, occurred_at
  ) values (
    p_event_id, v_attempt.organization_id, v_attempt.campaign_id, v_attempt.dispatch_id, v_attempt.job_id, v_attempt.id,
    p_device_id, p_event_type, p_part_index, p_result_code, v_occurred
  );

  if p_event_type = 'submitted' then
    if v_attempt.state = 'prepared' then
      update public.campaign_message_attempts a
      set state = 'submitted', submitted_at = coalesce(a.submitted_at, v_occurred)
      where a.id = v_attempt.id;
    end if;
  elsif p_event_type = 'unknown' then
    if v_attempt.state not in ('sent','delivered') then
      update public.campaign_message_attempts a
      set state = 'unknown', safe_retry_eligible = false,
          unknown_at = coalesce(a.unknown_at, v_occurred),
          terminal_reason = 'Android reported an ambiguous post-submission boundary. No automatic retry is permitted.'
      where a.id = v_attempt.id;

      update public.campaign_message_recovery_requests r
      set consumed_at = coalesce(r.consumed_at, v_occurred)
      where r.attempt_id = v_attempt.id
        and r.action = 'safe_retry'
        and r.consumed_at is null;
    end if;
  elsif p_event_type = 'sent' then
    select p.* into v_part
    from public.campaign_message_attempt_parts p
    where p.attempt_id = v_attempt.id and p.part_index = p_part_index
    for update;

    v_new_part_state := case when p_result_code = -1 then 'sent' else 'failed' end;
    if v_part.sent_state = 'pending' then
      update public.campaign_message_attempt_parts p
      set sent_state = v_new_part_state,
          sent_result_code = p_result_code,
          sent_at = v_occurred
      where p.attempt_id = v_attempt.id and p.part_index = p_part_index;
    elsif v_part.sent_state <> v_new_part_state or v_part.sent_result_code is distinct from p_result_code then
      v_conflict := true;
    end if;

    if v_conflict then
      update public.campaign_message_attempts a
      set state = 'unknown', safe_retry_eligible = false,
          unknown_at = coalesce(a.unknown_at, v_occurred),
          terminal_reason = 'Conflicting duplicate SENT callback observed; operator review required.'
      where a.id = v_attempt.id;

      update public.campaign_message_recovery_requests r
      set consumed_at = coalesce(r.consumed_at, v_occurred)
      where r.attempt_id = v_attempt.id
        and r.action = 'safe_retry'
        and r.consumed_at is null;
    else
      perform public.refresh_campaign_message_attempt_state_internal(v_attempt.id);
    end if;
  elsif p_event_type = 'delivery' then
    select p.* into v_part
    from public.campaign_message_attempt_parts p
    where p.attempt_id = v_attempt.id and p.part_index = p_part_index
    for update;

    v_new_part_state := case when p_result_code = -1 then 'delivered' else 'failed' end;
    if v_part.delivery_state = 'pending' then
      update public.campaign_message_attempt_parts p
      set delivery_state = v_new_part_state,
          delivery_result_code = p_result_code,
          delivered_at = v_occurred
      where p.attempt_id = v_attempt.id and p.part_index = p_part_index;
    end if;
    perform public.refresh_campaign_message_attempt_state_internal(v_attempt.id);
  end if;

  return query
  select a.id, a.client_attempt_id, a.attempt_number, a.state, a.safe_retry_eligible,
    count(*) filter (where p.sent_state = 'sent')::integer,
    count(*) filter (where p.sent_state = 'failed')::integer,
    count(*) filter (where p.delivery_state = 'delivered')::integer
  from public.campaign_message_attempts a
  join public.campaign_message_attempt_parts p on p.attempt_id = a.id
  where a.id = v_attempt.id
  group by a.id;
end;
$$;

create or replace function public.get_campaign_delivery_status(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table(
  dispatch_id uuid,
  recipient_count integer,
  awaiting_attempt_jobs integer,
  prepared_jobs integer,
  submitted_jobs integer,
  sent_jobs integer,
  delivered_jobs integer,
  failed_jobs integer,
  unknown_jobs integer,
  unresolved_unknown_jobs integer,
  retryable_failed_jobs integer,
  recovery_requested_jobs integer,
  latest_attempt_at timestamptz
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
  with d as (
    select cd.id, cd.recipient_count
    from public.campaign_dispatches cd
    where cd.organization_id = p_organization_id and cd.campaign_id = p_campaign_id
  ), latest as (
    select distinct on (a.job_id) a.*
    from public.campaign_message_attempts a
    where a.organization_id = p_organization_id and a.campaign_id = p_campaign_id
    order by a.job_id, a.attempt_number desc
  )
  select
    d.id,
    d.recipient_count,
    greatest(d.recipient_count - count(l.id)::integer, 0),
    count(*) filter (where l.state = 'prepared')::integer,
    count(*) filter (where l.state = 'submitted')::integer,
    count(*) filter (where l.state = 'sent')::integer,
    count(*) filter (where l.state = 'delivered')::integer,
    count(*) filter (where l.state = 'failed')::integer,
    count(*) filter (where l.state = 'unknown')::integer,
    count(*) filter (where l.state = 'unknown' and l.resolved_at is null)::integer,
    count(*) filter (where l.state = 'failed' and l.safe_retry_eligible is true and not exists (
      select 1 from public.campaign_message_recovery_requests r
      where r.attempt_id = l.id and r.action = 'safe_retry' and r.consumed_at is null
    ))::integer,
    count(*) filter (where exists (
      select 1 from public.campaign_message_recovery_requests r
      where r.attempt_id = l.id and r.consumed_at is null
    ))::integer,
    max(l.created_at)
  from d
  left join latest l on true
  group by d.id, d.recipient_count;
end;
$$;

create or replace function public.list_campaign_message_attempts(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_limit integer default 100
)
returns table(
  attempt_id uuid,
  job_id uuid,
  source_row_number integer,
  normalized_e164 text,
  attempt_number integer,
  state text,
  safe_retry_eligible boolean,
  terminal_reason text,
  submitted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  unknown_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz
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
  select a.id, a.job_id, j.source_row_number, j.normalized_e164, a.attempt_number,
         a.state, a.safe_retry_eligible, a.terminal_reason,
         a.submitted_at, a.sent_at, a.delivered_at, a.failed_at, a.unknown_at,
         a.resolved_at, a.resolution, a.created_at
  from public.campaign_message_attempts a
  join public.campaign_message_jobs j on j.id = a.job_id
  where a.organization_id = p_organization_id and a.campaign_id = p_campaign_id
  order by j.source_row_number, a.attempt_number desc, a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

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
  if p_action not in ('safe_retry','skip_unknown') then
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
    where (
      p_action = 'safe_retry' and l.state = 'failed' and l.safe_retry_eligible is true
    ) or (
      p_action = 'skip_unknown' and l.state = 'unknown' and l.resolved_at is null
    )
  )
  insert into public.campaign_message_recovery_requests (
    organization_id, campaign_id, dispatch_id, job_id, attempt_id, gateway_device_id,
    action, requested_by
  )
  select c.organization_id, c.campaign_id, c.dispatch_id, c.job_id, c.id, c.gateway_device_id,
         p_action, v_actor
  from candidates c
  on conflict (attempt_id, action) do nothing;

  get diagnostics v_count = row_count;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id, v_actor, 'campaign.message_recovery_requested', 'campaign', p_campaign_id::text,
    jsonb_build_object('recoveryAction', p_action, 'requestCount', v_count)
  );

  return v_count;
end;
$$;

create or replace function public.list_gateway_message_recovery_requests(
  p_device_id uuid,
  p_credential text,
  p_limit integer default 25
)
returns table(
  recovery_id uuid,
  action text,
  job_id uuid,
  campaign_id uuid,
  failed_client_attempt_id uuid,
  attempt_number integer,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth record;
  v_limit integer := least(greatest(coalesce(p_limit,25),1),25);
begin
  select * into v_auth
  from public.authenticate_gateway_queue_device_internal(p_device_id, p_credential);

  return query
  select r.id, r.action, r.job_id, r.campaign_id, a.client_attempt_id, a.attempt_number, r.requested_at
  from public.campaign_message_recovery_requests r
  join public.campaign_message_attempts a on a.id = r.attempt_id
  where r.organization_id = v_auth.organization_id
    and r.gateway_device_id = p_device_id
    and r.applied_at is null
    and r.consumed_at is null
  order by r.requested_at, r.id
  limit v_limit;
end;
$$;

create or replace function public.acknowledge_gateway_message_recovery(
  p_device_id uuid,
  p_credential text,
  p_recovery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth record;
  v_recovery public.campaign_message_recovery_requests%rowtype;
  v_attempt public.campaign_message_attempts%rowtype;
begin
  select * into v_auth
  from public.authenticate_gateway_queue_device_internal(p_device_id, p_credential);

  select r.* into v_recovery
  from public.campaign_message_recovery_requests r
  where r.id = p_recovery_id
    and r.organization_id = v_auth.organization_id
    and r.gateway_device_id = p_device_id
  for update;

  if v_recovery.id is null then
    raise exception 'Recovery request not found for this gateway device' using errcode = '42501';
  end if;
  if v_recovery.applied_at is not null then
    return true;
  end if;

  select a.* into v_attempt
  from public.campaign_message_attempts a
  where a.id = v_recovery.attempt_id
  for update;

  if v_recovery.action = 'safe_retry' then
    if v_attempt.state <> 'failed' or v_attempt.safe_retry_eligible is not true then
      raise exception 'Attempt is no longer safe-retry eligible' using errcode = '22023';
    end if;
    update public.campaign_message_recovery_requests r
    set applied_at = now(), applied_by_device_id = p_device_id
    where r.id = v_recovery.id;
  elsif v_recovery.action = 'skip_unknown' then
    if v_attempt.state <> 'unknown' or v_attempt.resolved_at is not null then
      raise exception 'UNKNOWN attempt is no longer pending recovery' using errcode = '22023';
    end if;
    update public.campaign_message_recovery_requests r
    set applied_at = now(), applied_by_device_id = p_device_id, consumed_at = now()
    where r.id = v_recovery.id;
    update public.campaign_message_attempts a
    set resolved_at = now(), resolution = 'skip_without_retry', safe_retry_eligible = false,
        terminal_reason = coalesce(a.terminal_reason,'UNKNOWN') || ' Operator chose continue without resend.'
    where a.id = v_attempt.id;
  end if;

  return true;
end;
$$;

revoke all on function public.refresh_campaign_message_attempt_state_internal(uuid) from public, anon, authenticated;
revoke all on function public.begin_gateway_message_attempt(uuid,text,uuid,uuid,integer) from public;
revoke all on function public.report_gateway_message_attempt_event(uuid,text,uuid,uuid,text,integer,integer,bigint) from public;
revoke all on function public.get_campaign_delivery_status(uuid,uuid) from public, anon;
revoke all on function public.list_campaign_message_attempts(uuid,uuid,integer) from public, anon;
revoke all on function public.request_campaign_message_recovery(uuid,uuid,text) from public, anon;
revoke all on function public.list_gateway_message_recovery_requests(uuid,text,integer) from public;
revoke all on function public.acknowledge_gateway_message_recovery(uuid,text,uuid) from public;

grant execute on function public.refresh_campaign_message_attempt_state_internal(uuid) to service_role;
-- Android authenticates these narrowly scoped RPCs with the gateway device credential.
grant execute on function public.begin_gateway_message_attempt(uuid,text,uuid,uuid,integer) to anon, authenticated, service_role;
grant execute on function public.report_gateway_message_attempt_event(uuid,text,uuid,uuid,text,integer,integer,bigint) to anon, authenticated, service_role;
grant execute on function public.list_gateway_message_recovery_requests(uuid,text,integer) to anon, authenticated, service_role;
grant execute on function public.acknowledge_gateway_message_recovery(uuid,text,uuid) to anon, authenticated, service_role;
-- Web recovery/status RPCs require a signed-in personal-workspace member.
grant execute on function public.get_campaign_delivery_status(uuid,uuid) to authenticated, service_role;
grant execute on function public.list_campaign_message_attempts(uuid,uuid,integer) to authenticated, service_role;
grant execute on function public.request_campaign_message_recovery(uuid,uuid,text) to authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.18.0',
  'phase', 'delivery_callbacks_attempt_history_safe_recovery',
  'delivery_callbacks_enabled', true,
  'message_attempt_history_enabled', true,
  'safe_retry_requires_explicit_web_request', true,
  'safe_retry_requires_zero_successful_sent_parts', true,
  'unknown_auto_retry_enabled', false,
  'unknown_skip_without_resend_enabled', true,
  'android_background_gateway_enabled', true
),
updated_at = now()
where key = 'schema';

commit;
