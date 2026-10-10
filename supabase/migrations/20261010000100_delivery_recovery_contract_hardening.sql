begin;

-- 0.18.5: additive gateway v2 contract; legacy RPC signatures remain available.
-- Resolution is an operator decision, separate from immutable transport evidence.
-- No callback, delivery failure, conflict or recovery outcome grants resend.
alter table public.campaign_message_attempts
  add column conflict_at timestamptz,
  add column conflict_reason text;
-- Preserve conflict ambiguity already known before this release.
update public.campaign_message_attempts a set conflict_at=coalesce(a.unknown_at,now()),
  conflict_reason='Historical conflicting SENT observations',state='unknown',safe_retry_eligible=false
where a.terminal_reason ilike '%conflicting%' or exists (
  select 1 from public.campaign_message_attempt_events e where e.attempt_id=a.id and e.event_type='sent'
  group by e.part_index having count(distinct e.result_code)>1
);
alter table public.campaign_dispatches add column queue_block_reason text;
alter table public.campaign_message_attempt_parts
  add column delivery_evidence text not null default 'none' check (delivery_evidence in ('none','legacy','verified')),
  add column delivery_format text,
  add column delivery_status integer;
update public.campaign_message_attempt_parts set delivery_evidence='legacy'
where delivery_result_code is not null;
-- Retain raw historical observations but stop asserting delivery without a report.
update public.campaign_message_attempts set state='sent', safe_retry_eligible=false,
  terminal_reason='Legacy delivery callback has no verified status-report evidence. SENT retained; delivery unverified.'
where state='delivered';

alter table public.campaign_message_recovery_requests
  add column outcome text not null default 'pending' check (outcome in ('pending','applied','superseded','rejected')),
  add column outcome_reason text,
  add column completed_at timestamptz;
update public.campaign_message_recovery_requests
set outcome=case when applied_at is not null then 'applied' else 'superseded' end,
    completed_at=coalesce(consumed_at,applied_at), outcome_reason='Historical recovery completion'
where consumed_at is not null or applied_at is not null;
alter table public.campaign_message_recovery_requests
  drop constraint campaign_message_recovery_requests_attempt_id_action_key;
create unique index campaign_recovery_one_pending_action
on public.campaign_message_recovery_requests(attempt_id,action) where outcome='pending';

-- Orthogonal to download state: old gateways still parse the existing queue enum.
alter table public.campaign_message_jobs
  add column execution_block_code text,
  add column execution_block_reason text,
  add column execution_blocked_at timestamptz;

-- Store conflicting observations without rewriting the original event UUID payload.
create table public.campaign_callback_conflicts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attempt_id uuid not null references public.campaign_message_attempts(id) on delete cascade,
  event_id uuid not null,
  payload_hash text not null,
  observation jsonb not null,
  received_at timestamptz not null default now(),
  unique(attempt_id,event_id,payload_hash)
);
alter table public.campaign_callback_conflicts enable row level security;
create policy callback_conflicts_owner on public.campaign_callback_conflicts for select to authenticated
using(public.is_org_member(organization_id));
revoke all on public.campaign_callback_conflicts from public,anon,authenticated;
grant select on public.campaign_callback_conflicts to authenticated;
grant all on public.campaign_callback_conflicts to service_role;

-- Minimal tombstone: no recipient, body, credentials or PDU. Retained until workspace
-- deletion so late callbacks cannot poison the outbox after permitted history deletion.
create table public.gateway_attempt_tombstones (
  client_attempt_id uuid primary key,
  attempt_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gateway_device_id uuid not null,
  attempt_number integer not null,
  deleted_at timestamptz not null default now()
);
alter table public.gateway_attempt_tombstones enable row level security;
revoke all on public.gateway_attempt_tombstones from public,anon,authenticated;
grant all on public.gateway_attempt_tombstones to service_role;
create function public.retain_gateway_attempt_tombstone_internal() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.organizations where id=old.organization_id) then return old; end if;
  insert into public.gateway_attempt_tombstones(client_attempt_id,attempt_id,organization_id,gateway_device_id,attempt_number)
  values(old.client_attempt_id,old.id,old.organization_id,old.gateway_device_id,old.attempt_number)
  on conflict(client_attempt_id) do nothing;
  return old;
end; $$;
create trigger retain_gateway_attempt_tombstone before delete on public.campaign_message_attempts
for each row execute function public.retain_gateway_attempt_tombstone_internal();
revoke all on function public.retain_gateway_attempt_tombstone_internal() from public,anon,authenticated;

create or replace function public.refresh_campaign_message_attempt_state_internal(p_attempt_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare a public.campaign_message_attempts%rowtype; n_sent integer; n_failed integer; n_delivery integer; n_parts integer;
begin
 select * into a from public.campaign_message_attempts where id=p_attempt_id for update;
 if a.id is null then raise exception 'Attempt not found' using errcode='P0002'; end if;
 select count(*),count(*) filter(where sent_state='sent'),count(*) filter(where sent_state='failed'),
   count(*) filter(where delivery_state='delivered' and delivery_evidence='verified')
 into n_parts,n_sent,n_failed,n_delivery from public.campaign_message_attempt_parts where attempt_id=a.id;
 if a.conflict_at is not null then
   update public.campaign_message_attempts set state='unknown',safe_retry_eligible=false,
     unknown_at=coalesce(unknown_at,now()),terminal_reason='Conflicting callback evidence retained; operator review required.' where id=a.id;
 elsif n_parts=a.expected_parts and n_sent=a.expected_parts then
   update public.campaign_message_attempts set state=case when n_delivery=a.expected_parts then 'delivered' else 'sent' end,
     safe_retry_eligible=false,sent_at=coalesce(sent_at,now()),
     delivered_at=case when n_delivery=a.expected_parts then coalesce(delivered_at,now()) else delivered_at end,
     terminal_reason=case when a.state='unknown' then 'Late complete SENT evidence; no resend authorized.' else terminal_reason end
   where id=a.id;
 elsif n_failed>0 and n_sent+n_failed=a.expected_parts then
   update public.campaign_message_attempts set state='unknown',safe_retry_eligible=false,
     unknown_at=coalesce(unknown_at,now()),terminal_reason='Post-SmsManager failure is ambiguous; no automatic resend.' where id=a.id;
 end if;
 -- Never clear resolved_at/resolution, including when transport truth changes.
end; $$;

create function public.report_gateway_message_attempt_event_v2(
 p_device_id uuid,p_credential text,p_event_id uuid,p_client_attempt_id uuid,p_event_type text,
 p_part_index integer default null,p_result_code integer default null,p_occurred_at_ms bigint default null,
 p_delivery_format text default null,p_delivery_status integer default null,p_delivery_pdu_sha256 text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
 au record; a public.campaign_message_attempts%rowtype; pt public.campaign_message_attempt_parts%rowtype;
 ev public.campaign_message_attempt_events%rowtype; tomb public.gateway_attempt_tombstones%rowtype;
 obs jsonb; prior jsonb; disposition text:='accepted'; conflict boolean:=false;
 evidence boolean:=false; delivery text:='pending'; occurred timestamptz:=now();
begin
 select * into au from public.authenticate_gateway_queue_device_internal(p_device_id,p_credential);
 if p_event_id is null or p_client_attempt_id is null or p_event_type is null or p_event_type not in ('submitted','sent','delivery','unknown') then
  raise exception 'Invalid callback observation' using errcode='22023'; end if;
 select * into a from public.campaign_message_attempts x where x.client_attempt_id=p_client_attempt_id
 and x.gateway_device_id=p_device_id and x.organization_id=au.organization_id for update;
 if a.id is null then
   select * into tomb from public.gateway_attempt_tombstones t where t.client_attempt_id=p_client_attempt_id
     and t.gateway_device_id=p_device_id and t.organization_id=au.organization_id;
   if tomb.client_attempt_id is not null then
     return jsonb_build_object('outcome','tombstoned','attempt_id',tomb.attempt_id,'client_attempt_id',tomb.client_attempt_id,
       'attempt_number',tomb.attempt_number,'state','unknown','safe_retry_eligible',false,'sent_parts',0,'failed_sent_parts',0,'delivered_parts',0);
   end if;
   -- Same response for absent and other-tenant work. v2 clients quarantine; never resend.
   return jsonb_build_object('outcome','rejected','reason','attempt_unavailable','safe_retry_eligible',false);
 end if;
 if p_event_type in ('sent','delivery') then
   if p_part_index is null or p_result_code is null or p_part_index<0 or p_part_index>=a.expected_parts then
     raise exception 'Invalid multipart callback' using errcode='22023'; end if;
 elsif p_part_index is not null or p_result_code is not null then
   raise exception 'Non-part event cannot carry part data' using errcode='22023';
 end if;
 if p_event_type<>'delivery' and (p_delivery_format is not null or p_delivery_status is not null or p_delivery_pdu_sha256 is not null) then
   raise exception 'Delivery evidence on non-delivery event' using errcode='22023'; end if;
 if p_occurred_at_ms is not null then
   if p_occurred_at_ms<1 or p_occurred_at_ms>32503680000000 then raise exception 'Invalid observation time' using errcode='22023'; end if;
   occurred:=to_timestamp(p_occurred_at_ms::numeric/1000);
 end if;
 obs:=jsonb_build_object('event_type',p_event_type,'part_index',p_part_index,'result_code',p_result_code,
   'occurred_at_ms',p_occurred_at_ms,'delivery_format',p_delivery_format,'delivery_status',p_delivery_status,'delivery_pdu_sha256',p_delivery_pdu_sha256);
 select * into ev from public.campaign_message_attempt_events e where e.event_id=p_event_id;
 if ev.id is not null then
   if ev.attempt_id<>a.id or ev.actor_device_id<>p_device_id then raise exception 'Event identity belongs to different work' using errcode='22023'; end if;
   prior:=ev.metadata->'observation';
   if prior is null then
     -- Historical events did not retain all v2 fields; compare only their recorded payload.
     conflict:=ev.event_type<>p_event_type or ev.part_index is distinct from p_part_index or ev.result_code is distinct from p_result_code
       or p_delivery_format is not null or p_delivery_status is not null or p_delivery_pdu_sha256 is not null;
   else conflict:=prior<>obs; end if;
   disposition:=case when conflict then 'conflict' else 'duplicate' end;
 else
   insert into public.campaign_message_attempt_events(event_id,organization_id,campaign_id,dispatch_id,job_id,attempt_id,actor_device_id,event_type,part_index,result_code,occurred_at,metadata)
   values(p_event_id,a.organization_id,a.campaign_id,a.dispatch_id,a.job_id,a.id,p_device_id,p_event_type,p_part_index,p_result_code,occurred,jsonb_build_object('observation',obs,'contract',2));
   if p_event_type='submitted' then
     update public.campaign_message_attempts set state=case when state='prepared' then 'submitted' else state end,submitted_at=coalesce(submitted_at,occurred) where id=a.id;
   elsif p_event_type='unknown' then
     update public.campaign_message_attempts set state='unknown',safe_retry_eligible=false,unknown_at=coalesce(unknown_at,occurred),
       terminal_reason='Ambiguous post-submission boundary; no automatic resend.' where id=a.id and state not in ('sent','delivered');
   else
     select * into pt from public.campaign_message_attempt_parts where attempt_id=a.id and part_index=p_part_index for update;
     if p_event_type='sent' then
       if pt.sent_state='pending' then
         update public.campaign_message_attempt_parts set sent_state=case when p_result_code=-1 then 'sent' else 'failed' end,
           sent_result_code=p_result_code,sent_at=occurred where attempt_id=a.id and part_index=p_part_index;
       else conflict:=pt.sent_result_code is distinct from p_result_code; end if;
     else
       -- Android SmsMessage.getStatus() places CDMA status in bits 31..16.
       evidence:=p_result_code=-1 and p_delivery_format in ('3gpp','3gpp2') and p_delivery_status>=0
         and p_delivery_pdu_sha256 ~ '^[0-9a-f]{64}$'
         and ((p_delivery_format='3gpp' and p_delivery_status<=255) or (p_delivery_format='3gpp2' and p_delivery_status<=67043328 and (p_delivery_status & 65535)=0));
       if evidence is true then
         delivery:=case
           when (p_delivery_format='3gpp' and p_delivery_status<32) or (p_delivery_format='3gpp2' and p_delivery_status=0) then 'delivered'
           when (p_delivery_format='3gpp' and p_delivery_status>=64) or (p_delivery_format='3gpp2' and (p_delivery_status>>24)>=2) then 'failed'
           else 'pending' end;
         if pt.delivery_evidence='verified' and pt.delivery_state<>'pending' then
           -- Pending after terminal is an out-of-order observation, not a downgrade.
           conflict:=delivery<>'pending' and delivery<>pt.delivery_state;
         else
           update public.campaign_message_attempt_parts set delivery_state=delivery,delivery_result_code=p_result_code,
             delivery_evidence='verified',delivery_format=p_delivery_format,delivery_status=p_delivery_status,
             delivered_at=case when delivery='delivered' then occurred else null end where attempt_id=a.id and part_index=p_part_index;
         end if;
       elsif pt.delivery_evidence='none' then
         update public.campaign_message_attempt_parts set delivery_evidence='legacy',delivery_result_code=p_result_code
         where attempt_id=a.id and part_index=p_part_index;
       end if;
     end if;
   end if;
 end if;
 if conflict then
   insert into public.campaign_callback_conflicts(organization_id,attempt_id,event_id,payload_hash,observation)
   values(a.organization_id,a.id,p_event_id,encode(digest(obs::text,'sha256'),'hex'),obs) on conflict do nothing;
   update public.campaign_message_attempts set conflict_at=coalesce(conflict_at,now()),conflict_reason='Conflicting immutable callback observation' where id=a.id;
   disposition:='conflict';
 end if;
 perform public.refresh_campaign_message_attempt_state_internal(a.id);
 return (select jsonb_build_object('outcome',disposition,'attempt_id',x.id,'client_attempt_id',x.client_attempt_id,
   'attempt_number',x.attempt_number,'state',x.state,'safe_retry_eligible',false,'conflict',x.conflict_at is not null,
   'resolved_at',x.resolved_at,'resolution',x.resolution,
   'sent_parts',count(*) filter(where p.sent_state='sent'),'failed_sent_parts',count(*) filter(where p.sent_state='failed'),
   'delivered_parts',count(*) filter(where p.delivery_state='delivered' and p.delivery_evidence='verified'))
 from public.campaign_message_attempts x join public.campaign_message_attempt_parts p on p.attempt_id=x.id where x.id=a.id group by x.id);
end; $$;

-- Preserve v1 result shape. Legacy delivery callbacks are accepted as observations,
-- but cannot prove DELIVERED. No need to upgrade installed Android before deployment.
create or replace function public.report_gateway_message_attempt_event(
 p_device_id uuid,p_credential text,p_event_id uuid,p_client_attempt_id uuid,p_event_type text,
 p_part_index integer default null,p_result_code integer default null,p_occurred_at_ms bigint default null
) returns table(attempt_id uuid,client_attempt_id uuid,attempt_number integer,state text,safe_retry_eligible boolean,sent_parts integer,failed_sent_parts integer,delivered_parts integer)
language plpgsql security definer set search_path=public,extensions as $$
declare r jsonb;
begin
 r:=public.report_gateway_message_attempt_event_v2(p_device_id,p_credential,p_event_id,p_client_attempt_id,p_event_type,p_part_index,p_result_code,p_occurred_at_ms);
 if r->>'outcome'='rejected' then raise exception 'Message attempt unavailable for this gateway' using errcode='42501'; end if;
 return query select (r->>'attempt_id')::uuid,(r->>'client_attempt_id')::uuid,(r->>'attempt_number')::integer,r->>'state',false,
   (r->>'sent_parts')::integer,(r->>'failed_sent_parts')::integer,(r->>'delivered_parts')::integer;
end; $$;

create function public.retire_gateway_recoveries_internal(p_device_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update public.campaign_message_recovery_requests r
 set outcome=case when r.action='safe_retry' then 'rejected' else 'superseded' end,
     outcome_reason=case when r.action='safe_retry' then 'resend_disabled' else 'attempt_no_longer_requires_recovery' end,
     completed_at=now(),consumed_at=coalesce(r.consumed_at,now())
 from public.campaign_message_attempts a
 where a.id=r.attempt_id and r.gateway_device_id=p_device_id and r.outcome='pending'
 and (r.action='safe_retry' or a.state<>'unknown' or a.resolved_at is not null or exists(
   select 1 from public.campaign_message_attempts newer where newer.job_id=a.job_id and newer.attempt_number>a.attempt_number));
end; $$;

create or replace function public.list_gateway_message_recovery_requests(p_device_id uuid,p_credential text,p_limit integer default 25)
returns table(recovery_id uuid,action text,job_id uuid,campaign_id uuid,failed_client_attempt_id uuid,attempt_number integer,requested_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
declare au record;
begin
 select * into au from public.authenticate_gateway_queue_device_internal(p_device_id,p_credential);
 -- Retire the entire obsolete set BEFORE applying the page limit.
 perform public.retire_gateway_recoveries_internal(p_device_id);
 return query select r.id,r.action,r.job_id,r.campaign_id,a.client_attempt_id,a.attempt_number,r.requested_at
 from public.campaign_message_recovery_requests r join public.campaign_message_attempts a on a.id=r.attempt_id
 where r.organization_id=au.organization_id and r.gateway_device_id=p_device_id and r.outcome='pending'
 order by r.requested_at,r.id limit least(greatest(coalesce(p_limit,25),1),25);
end; $$;

create function public.acknowledge_gateway_message_recovery_v2(
 p_device_id uuid,p_credential text,p_recovery_id uuid,p_outcome text default 'applied'
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare au record; r public.campaign_message_recovery_requests%rowtype; a public.campaign_message_attempts%rowtype; result text; reason text;
begin
 select * into au from public.authenticate_gateway_queue_device_internal(p_device_id,p_credential);
 if p_outcome is null or p_outcome not in ('applied','not_applicable','rejected') then raise exception 'Invalid recovery outcome' using errcode='22023'; end if;
 select * into r from public.campaign_message_recovery_requests x where x.id=p_recovery_id and x.gateway_device_id=p_device_id and x.organization_id=au.organization_id;
 if r.id is null then return jsonb_build_object('outcome','rejected','reason','recovery_unavailable','terminal',true); end if;
 -- Same lock order as callbacks/request creation: attempt, then recovery.
 select * into a from public.campaign_message_attempts where id=r.attempt_id for update;
 select * into r from public.campaign_message_recovery_requests where id=p_recovery_id for update;
 if r.outcome<>'pending' then return jsonb_build_object('outcome',r.outcome,'reason',r.outcome_reason,'terminal',true); end if;
 if r.action='safe_retry' then result:='rejected';reason:='resend_disabled';
 elsif a.state<>'unknown' or a.resolved_at is not null or exists(select 1 from public.campaign_message_attempts n where n.job_id=a.job_id and n.attempt_number>a.attempt_number) then
   result:='superseded';reason:='attempt_no_longer_requires_recovery';
 elsif p_outcome<>'applied' then result:='rejected';reason:='device_did_not_apply';
 else
   result:='applied';reason:='skip_without_retry';
   update public.campaign_message_attempts set resolved_at=coalesce(resolved_at,now()),resolution='skip_without_retry',safe_retry_eligible=false where id=a.id;
 end if;
 update public.campaign_message_recovery_requests set outcome=result,outcome_reason=reason,completed_at=now(),consumed_at=now(),
   applied_at=case when result='applied' then now() else applied_at end,
   applied_by_device_id=case when result='applied' then p_device_id else applied_by_device_id end where id=r.id;
 return jsonb_build_object('outcome',result,'reason',reason,'terminal',true);
end; $$;

create or replace function public.acknowledge_gateway_message_recovery(p_device_id uuid,p_credential text,p_recovery_id uuid)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
 result:=public.acknowledge_gateway_message_recovery_v2(p_device_id,p_credential,p_recovery_id,'applied');
 if result->>'reason'='recovery_unavailable' then raise exception 'Recovery unavailable for this gateway' using errcode='42501'; end if;
 -- v1 Boolean acknowledges terminal processing, including superseded recovery.
 return true;
end; $$;

create or replace function public.request_campaign_message_recovery(p_organization_id uuid,p_campaign_id uuid,p_action text)
returns integer language plpgsql security definer set search_path=public as $$
declare a public.campaign_message_attempts%rowtype; n integer:=0; inserted integer;
begin
 if auth.uid() is null or not public.is_org_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 if p_action is distinct from 'skip_unknown' then raise exception 'Only continue without resend is permitted' using errcode='22023'; end if;
 for a in select x.* from public.campaign_message_attempts x where x.organization_id=p_organization_id and x.campaign_id=p_campaign_id
   and not exists(select 1 from public.campaign_message_attempts newer where newer.job_id=x.job_id and newer.attempt_number>x.attempt_number)
   order by x.id for update
 loop
  if a.state<>'unknown' or a.resolved_at is not null then continue; end if;
  insert into public.campaign_message_recovery_requests(organization_id,campaign_id,dispatch_id,job_id,attempt_id,gateway_device_id,action,requested_by)
  values(a.organization_id,a.campaign_id,a.dispatch_id,a.job_id,a.id,a.gateway_device_id,'skip_unknown',auth.uid())
  on conflict(attempt_id,action) where outcome='pending' do nothing;
  get diagnostics inserted=row_count;n:=n+inserted;
 end loop;
 insert into public.audit_logs(organization_id,actor_user_id,action,target_type,target_id,metadata)
 values(p_organization_id,auth.uid(),'campaign.message_recovery_requested','campaign',p_campaign_id::text,jsonb_build_object('recoveryAction','skip_unknown','requestCount',n,'safeRetryDisabled',true));
 return n;
end; $$;

create function public.begin_gateway_message_attempt_v2(p_device_id uuid,p_credential text,p_job_id uuid,p_client_attempt_id uuid,p_expected_parts integer)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare au record; j public.campaign_message_jobs%rowtype; a public.campaign_message_attempts%rowtype; compliance record; code text; reason text;
begin
 select * into au from public.authenticate_gateway_queue_device_internal(p_device_id,p_credential);
 if p_client_attempt_id is null or p_expected_parts is null or p_expected_parts<1 then raise exception 'Invalid attempt request' using errcode='22023'; end if;
 select x.* into j from public.campaign_message_jobs x join public.campaign_dispatches d on d.id=x.dispatch_id
 where x.id=p_job_id and x.organization_id=au.organization_id and d.gateway_device_id=p_device_id for update of x;
 if j.id is null then raise exception 'Job unavailable for gateway' using errcode='42501'; end if;
 if j.state<>'downloaded' or j.lease_owner_device_id is distinct from p_device_id then raise exception 'Job not durably downloaded by gateway' using errcode='22023'; end if;
 if j.execution_block_code is not null then return jsonb_build_object('outcome','blocked','code',j.execution_block_code,'reason',j.execution_block_reason,'can_submit',false); end if;
 -- A reused UUID may never authorize different immutable work or resurrect deleted history.
 select * into a from public.campaign_message_attempts where client_attempt_id=p_client_attempt_id;
 if a.id is not null and (a.job_id<>j.id or a.gateway_device_id<>p_device_id or a.expected_parts<>p_expected_parts) then raise exception 'Attempt identity mismatch' using errcode='22023'; end if;
 if exists(select 1 from public.gateway_attempt_tombstones where client_attempt_id=p_client_attempt_id) then raise exception 'Retired attempt identity' using errcode='22023'; end if;
 begin
   perform public.assert_gateway_dispatch_identity_internal(j.dispatch_id,p_device_id);
 exception when sqlstate '22023' then
   update public.campaign_dispatches set queue_block_reason=SQLERRM where id=j.dispatch_id;
   return jsonb_build_object('outcome','blocked','code','sim_gate','reason',SQLERRM,'can_submit',false,'recheck_after_inventory',true);
 end;
 update public.campaign_dispatches set queue_block_reason=null where id=j.dispatch_id;
 select * into compliance from public.contact_compliance_state_internal(j.organization_id,j.normalized_e164);
 if j.segment_count<>p_expected_parts then code:='segment_mismatch';reason:='Handset segmentation differs from frozen queue.';
 elsif compliance.eligibility_state is distinct from 'eligible' then code:='recipient_ineligible';reason:=coalesce(compliance.block_reason,'Current consent/suppression policy blocks recipient.'); end if;
 if code is not null then
   -- Existing registration could have crossed SmsManager already. Record a gate block,
   -- never assert zero external effect or clear attempt history from this rejection.
   update public.campaign_message_jobs set execution_block_code=code,execution_block_reason=reason,execution_blocked_at=now() where id=j.id;
   return jsonb_build_object('outcome','blocked','code',code,'reason',reason,'can_submit',false);
 end if;
 if a.id is null then
   if exists(select 1 from public.campaign_message_attempts where job_id=j.id) then raise exception 'Job already attempted; resend disabled' using errcode='22023'; end if;
   insert into public.campaign_message_attempts(organization_id,campaign_id,dispatch_id,job_id,gateway_device_id,client_attempt_id,attempt_number,expected_parts,state)
   values(j.organization_id,j.campaign_id,j.dispatch_id,j.id,p_device_id,p_client_attempt_id,1,p_expected_parts,'prepared') returning * into a;
   insert into public.campaign_message_attempt_parts(attempt_id,part_index) select a.id,generate_series(0,p_expected_parts-1);
 end if;
 return jsonb_build_object('outcome','registered','attempt_id',a.id,'client_attempt_id',a.client_attempt_id,'attempt_number',a.attempt_number,
   'state',a.state,'safe_retry_eligible',false,'created_at',a.created_at,'can_submit',a.state='prepared');
end; $$;

create or replace function public.begin_gateway_message_attempt(p_device_id uuid,p_credential text,p_job_id uuid,p_client_attempt_id uuid,p_expected_parts integer)
returns table(attempt_id uuid,client_attempt_id uuid,attempt_number integer,state text,safe_retry_eligible boolean,created_at timestamptz)
language plpgsql security definer set search_path=public,extensions as $$
declare r jsonb;
begin
 r:=public.begin_gateway_message_attempt_v2(p_device_id,p_credential,p_job_id,p_client_attempt_id,p_expected_parts);
 -- Empty success response makes legacy Android's registration parser fail closed,
 -- while allowing the block record to COMMIT (raising would roll it back).
 if r->>'outcome'='blocked' or r->>'can_submit'='false' then return; end if;
 return query select (r->>'attempt_id')::uuid,(r->>'client_attempt_id')::uuid,(r->>'attempt_number')::integer,r->>'state',false,(r->>'created_at')::timestamptz;
end; $$;

create or replace function public.claim_gateway_message_jobs(
  p_device_id uuid,
  p_credential text,
  p_limit integer default 20
)
returns table(
  job_id uuid,
  dispatch_id uuid,
  campaign_id uuid,
  source_row_number integer,
  normalized_e164 text,
  rendered_message text,
  sms_encoding text,
  segment_count integer,
  lease_token uuid,
  lease_version integer,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  gateway_sim_id uuid,
  sim_subscription_id integer,
  sim_slot_index integer,
  sim_identity_hash text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth record;
  v_now timestamptz := now();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 25);
  v_dispatch public.campaign_dispatches%rowtype;
  v_job public.campaign_message_jobs%rowtype;
  v_leased public.campaign_message_jobs%rowtype;
  v_compliance record;
  v_count integer := 0;
begin
  select *
    into v_auth
  from public.authenticate_gateway_queue_device_internal(p_device_id, p_credential);

  perform public.requeue_expired_gateway_leases_internal(p_device_id);

  for v_dispatch in
  select d.*
  from public.campaign_dispatches d
  where d.organization_id = v_auth.organization_id
    and d.gateway_device_id = p_device_id
    and exists (
      select 1
      from public.campaign_message_jobs pending
      where pending.dispatch_id = d.id
        and pending.state = 'queued' and pending.execution_block_code is null
    )
  order by d.enqueued_at, d.id
  loop
  begin
    perform public.assert_gateway_dispatch_identity_internal(v_dispatch.id, p_device_id);
  exception when sqlstate '22023' then
    update public.campaign_dispatches set queue_block_reason=SQLERRM where id=v_dispatch.id;
    -- Wrong historical binding/missing SIM/stale inventory: skip this dispatch,
    -- never fall back to a SIM. Rechecked on the next poll after inventory changes.
    continue;
  end;

  update public.campaign_dispatches set queue_block_reason=null where id=v_dispatch.id;
  for v_job in
    select j.*
    from public.campaign_message_jobs j
    where j.dispatch_id = v_dispatch.id
      and j.organization_id = v_auth.organization_id
      and j.state = 'queued' and j.execution_block_code is null
    order by j.source_row_number, j.id
    for update skip locked
  loop
    exit when v_count >= v_limit;
    select * into v_compliance from public.contact_compliance_state_internal(v_job.organization_id,v_job.normalized_e164);
    if v_compliance.eligibility_state is distinct from 'eligible' then
      update public.campaign_message_jobs set execution_block_code='recipient_ineligible',
        execution_block_reason=coalesce(v_compliance.block_reason,'Current consent/suppression policy blocks recipient.'),execution_blocked_at=now()
      where id=v_job.id;
      continue;
    end if;
    update public.campaign_message_jobs j
    set state = 'leased',
        lease_owner_device_id = p_device_id,
        lease_token = gen_random_uuid(),
        lease_version = j.lease_version + 1,
        leased_at = v_now,
        lease_expires_at = v_now + interval '2 minutes'
    where j.id = v_job.id
      and j.state = 'queued'
    returning j.* into v_leased;

    if v_leased.id is null then
      continue;
    end if;

    insert into public.campaign_queue_events (
      organization_id, dispatch_id, job_id, event_type, actor_type, actor_device_id, metadata
    ) values (
      v_leased.organization_id,
      v_leased.dispatch_id,
      v_leased.id,
      'job_leased',
      'device',
      p_device_id,
      jsonb_build_object(
        'leaseVersion', v_leased.lease_version,
        'leaseExpiresAt', v_leased.lease_expires_at
      )
    );

    job_id := v_leased.id;
    dispatch_id := v_leased.dispatch_id;
    campaign_id := v_leased.campaign_id;
    source_row_number := v_leased.source_row_number;
    normalized_e164 := v_leased.normalized_e164;
    rendered_message := v_leased.rendered_message;
    sms_encoding := v_leased.sms_encoding;
    segment_count := v_leased.segment_count;
    lease_token := v_leased.lease_token;
    lease_version := v_leased.lease_version;
    leased_at := v_leased.leased_at;
    lease_expires_at := v_leased.lease_expires_at;
    gateway_sim_id := v_dispatch.gateway_sim_id;
    sim_subscription_id := v_dispatch.sim_subscription_id;
    sim_slot_index := v_dispatch.sim_slot_index;
    sim_identity_hash := v_dispatch.sim_identity_hash;
    v_count:=v_count+1;
    return next;
  end loop;
  exit when v_count>=v_limit;
  end loop;
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
      where r.attempt_id = l.id and r.action = 'safe_retry' and r.outcome='pending' and l.state='unknown' and l.resolved_at is null
    ))::integer,
    count(*) filter (where exists (
      select 1 from public.campaign_message_recovery_requests r
      where r.attempt_id = l.id and r.outcome='pending' and l.state='unknown' and l.resolved_at is null
    ))::integer,
    max(l.created_at)
  from d
  left join latest l on true
  group by d.id, d.recipient_count;
end;
$$;

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
      and r.outcome='pending'
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

  perform d.id from public.gateway_devices d
  join public.campaign_dispatches cd on cd.gateway_device_id=d.id
  where cd.organization_id=p_organization_id and cd.campaign_id=p_campaign_id
  order by d.id for update of d;

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


create or replace function public.delete_campaign_history(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c record;r jsonb;n integer:=0;s integer:=0;q integer:=0;items jsonb:='[]';
begin
 if auth.uid() is null or not public.is_org_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 -- Same device-first order as single delete and gateway mutations.
 perform d.id from public.gateway_devices d where d.organization_id=p_organization_id order by d.id for update;
 for c in select id,title from public.campaigns where organization_id=p_organization_id order by id loop
   begin
     r:=public.delete_campaign(p_organization_id,c.id);n:=n+1;q:=q+(r->>'cancelledQueuedJobs')::integer;
   exception when sqlstate '22023' then
     s:=s+1;items:=items||jsonb_build_array(jsonb_build_object('campaignId',c.id,'title',c.title,'reason',SQLERRM));
   end;
 end loop;
 return jsonb_build_object('deletedCount',n,'skippedCount',s,'cancelledQueuedJobs',q,'skipped',items);
end; $$;

create function public.get_campaign_contract_health(p_organization_id uuid,p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_org_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 if not exists(select 1 from public.campaigns where id=p_campaign_id and organization_id=p_organization_id) then raise exception 'Campaign not found' using errcode='P0002'; end if;
 return jsonb_build_object('contract_version',2,
 'dispatch_block_reason',(select queue_block_reason from public.campaign_dispatches where campaign_id=p_campaign_id and organization_id=p_organization_id),
 'blocked_jobs',(select count(*) from public.campaign_message_jobs where campaign_id=p_campaign_id and organization_id=p_organization_id and execution_block_code is not null),
 'block_reasons',(select coalesce(jsonb_agg(x),'[]') from (select execution_block_code as code,count(*) as jobs from public.campaign_message_jobs where campaign_id=p_campaign_id and organization_id=p_organization_id and execution_block_code is not null group by execution_block_code order by execution_block_code)x),
 'conflicted_attempts',(select count(*) from public.campaign_message_attempts where campaign_id=p_campaign_id and organization_id=p_organization_id and conflict_at is not null),
 'legacy_delivery_parts',(select count(*) from public.campaign_message_attempt_parts p join public.campaign_message_attempts a on a.id=p.attempt_id where a.campaign_id=p_campaign_id and a.organization_id=p_organization_id and p.delivery_evidence='legacy'),
 'recovery_outcomes',(select coalesce(jsonb_object_agg(x.outcome,x.n),'{}') from (select outcome,count(*) as n from public.campaign_message_recovery_requests where campaign_id=p_campaign_id and organization_id=p_organization_id group by outcome)x));
end; $$;

-- Explicit least-privilege grants for every new security-definer entry point.
revoke all on function public.report_gateway_message_attempt_event_v2(uuid,text,uuid,uuid,text,integer,integer,bigint,text,integer,text) from public,anon,authenticated;
revoke all on function public.acknowledge_gateway_message_recovery_v2(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.begin_gateway_message_attempt_v2(uuid,text,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.retire_gateway_recoveries_internal(uuid) from public,anon,authenticated;
revoke all on function public.get_campaign_contract_health(uuid,uuid) from public,anon,authenticated;
grant execute on function public.report_gateway_message_attempt_event_v2(uuid,text,uuid,uuid,text,integer,integer,bigint,text,integer,text) to anon,authenticated,service_role;
grant execute on function public.acknowledge_gateway_message_recovery_v2(uuid,text,uuid,text) to anon,authenticated,service_role;
grant execute on function public.begin_gateway_message_attempt_v2(uuid,text,uuid,uuid,integer) to anon,authenticated,service_role;
grant execute on function public.retire_gateway_recoveries_internal(uuid) to service_role;
grant execute on function public.get_campaign_contract_health(uuid,uuid) to authenticated,service_role;
revoke all on function public.refresh_campaign_message_attempt_state_internal(uuid) from public,anon,authenticated;
grant execute on function public.refresh_campaign_message_attempt_state_internal(uuid) to service_role;

update public.app_meta set value=value||jsonb_build_object('version', '0.18.5','phase','delivery_recovery_contract_hardening',
 'gateway_contract_version',2,'legacy_delivery_is_unverified',true,'conflict_latch_enabled',true,
 'recovery_terminal_outcomes',true,'callback_tombstone_retention','until_workspace_deletion',
 'unknown_auto_retry_enabled',false,'callback_derived_safe_retry_enabled',false),updated_at=now() where key='schema';
notify pgrst,'reload schema';
commit;
