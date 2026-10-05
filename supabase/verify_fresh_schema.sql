-- BulkText Individual-First schema verification through migration 20261001000320.
-- Structural/metadata checks only; this script does not create or modify application data.
-- Web 0.16.2 adds no migration, so app_meta.schema.version remains 0.16.0 from 00320.

do $$
declare
  v_meta jsonb;
  v_missing text[] := array[]::text[];
  v_name text;
begin
  select value into v_meta from public.app_meta where key = 'schema';

  if v_meta is null then
    raise exception 'Missing app_meta schema metadata';
  end if;

  if coalesce(v_meta ->> 'version', '') <> '0.16.0' then
    raise exception 'Expected app_meta schema version 0.16.0 from migration 00320, got %', v_meta;
  end if;

  if coalesce(v_meta ->> 'tenant_model', '') <> 'hidden_personal_workspace' then
    raise exception 'Expected hidden_personal_workspace tenant model, got %', v_meta;
  end if;

  if coalesce((v_meta ->> 'campaign_confirmation_enabled')::boolean, false) is not true then
    raise exception 'Campaign confirmation must be enabled';
  end if;

  if coalesce((v_meta ->> 'gateway_preflight_enabled')::boolean, false) is not true then
    raise exception 'Gateway preflight must be enabled';
  end if;

  if coalesce((v_meta ->> 'campaign_send_authorization_enabled')::boolean, false) is not true then
    raise exception 'Campaign send authorization must be enabled';
  end if;

  if coalesce((v_meta ->> 'queue_enabled')::boolean, false) is not true then
    raise exception 'Durable cloud queue must be enabled after 00320';
  end if;

  if coalesce((v_meta ->> 'campaign_send_enabled')::boolean, false) is not false then
    raise exception 'Cloud SMS execution must remain disabled through Web 0.16.2';
  end if;

  if coalesce((v_meta ->> 'queue_lease_seconds')::integer, 0) <> 120 then
    raise exception 'Expected queue_lease_seconds=120, got %', v_meta ->> 'queue_lease_seconds';
  end if;

  if coalesce((v_meta ->> 'queue_claim_max_jobs')::integer, 0) <> 25 then
    raise exception 'Expected queue_claim_max_jobs=25, got %', v_meta ->> 'queue_claim_max_jobs';
  end if;

  if coalesce((v_meta ->> 'queue_download_ack_required')::boolean, false) is not true then
    raise exception 'Durable download ACK must remain required';
  end if;

  if coalesce((v_meta ->> 'exact_sim_queue_claim_required')::boolean, false) is not true then
    raise exception 'Exact-SIM queue claim enforcement must remain enabled';
  end if;

  foreach v_name in array array[
    'profiles','organizations','organization_members','audit_logs',
    'gateway_devices','gateway_pairing_codes','gateway_device_credentials',
    'gateway_device_sims','gateway_device_sim_bindings',
    'contact_imports','contact_import_rows','recipient_previews','recipient_preview_rows',
    'contact_consent_events','contact_suppression_events',
    'recipient_eligibility_snapshots','recipient_eligibility_rows',
    'message_composer_drafts',
    'campaigns','campaign_recipients',
    'campaign_send_authorizations',
    'campaign_dispatches','campaign_message_jobs','campaign_queue_events'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := array_append(v_missing, v_name);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'Missing required tables through 00320: %', array_to_string(v_missing, ', ');
  end if;

  -- Campaign confirmation snapshot (00300/00305).
  if to_regprocedure('public.confirm_campaign(uuid,uuid,uuid)') is null then
    raise exception 'Missing confirm_campaign(uuid,uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.list_campaign_confirmations(uuid)') is null then
    raise exception 'Missing list_campaign_confirmations(uuid) RPC';
  end if;
  if to_regprocedure('public.get_campaign_confirmation(uuid,uuid)') is null then
    raise exception 'Missing get_campaign_confirmation(uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.list_campaign_confirmation_recipients(uuid,uuid,integer,integer)') is null then
    raise exception 'Missing list_campaign_confirmation_recipients(uuid,uuid,integer,integer) RPC';
  end if;

  -- Gateway preflight / short-lived authorization (00310).
  if to_regprocedure('public.get_campaign_send_preflight(uuid,uuid)') is null then
    raise exception 'Missing get_campaign_send_preflight(uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.authorize_campaign_send(uuid,uuid)') is null then
    raise exception 'Missing authorize_campaign_send(uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.get_latest_campaign_send_authorization(uuid,uuid)') is null then
    raise exception 'Missing get_latest_campaign_send_authorization(uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.revoke_campaign_send_authorization(uuid,uuid,uuid)') is null then
    raise exception 'Missing revoke_campaign_send_authorization(uuid,uuid,uuid) RPC';
  end if;

  -- Durable queue Web RPCs (00320).
  if to_regprocedure('public.enqueue_campaign_dispatch(uuid,uuid,uuid)') is null then
    raise exception 'Missing enqueue_campaign_dispatch(uuid,uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.get_campaign_dispatch(uuid,uuid)') is null then
    raise exception 'Missing get_campaign_dispatch(uuid,uuid) RPC';
  end if;

  -- Android credential-authenticated durable queue contract (00320).
  if to_regprocedure('public.claim_gateway_message_jobs(uuid,text,integer)') is null then
    raise exception 'Missing claim_gateway_message_jobs(uuid,text,integer) RPC';
  end if;
  if to_regprocedure('public.acknowledge_gateway_message_jobs(uuid,text,jsonb)') is null then
    raise exception 'Missing acknowledge_gateway_message_jobs(uuid,text,jsonb) RPC';
  end if;
  if to_regprocedure('public.release_gateway_message_job_leases(uuid,text,jsonb)') is null then
    raise exception 'Missing release_gateway_message_job_leases(uuid,text,jsonb) RPC';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='gateway_devices'
      and indexname='gateway_devices_one_active_per_workspace'
  ) then
    raise exception 'Missing one-active-gateway-per-workspace unique index';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='campaign_send_authorizations'
      and indexname='campaign_send_authorizations_one_open_idx'
  ) then
    raise exception 'Missing one-open-send-authorization index';
  end if;

  -- Individual-first cleanup must remain in force.
  if to_regclass('public.organization_invitations') is not null then
    raise exception 'Legacy organization_invitations table should not exist';
  end if;
  if to_regprocedure('public.create_organization(text)') is not null then
    raise exception 'Legacy create_organization(text) RPC should not exist';
  end if;
  if to_regprocedure('public.list_my_organizations()') is not null then
    raise exception 'Legacy list_my_organizations() RPC should not exist';
  end if;

  raise notice 'BulkText schema structural verification through 20261001000320 PASS';
end;
$$;

select key, value from public.app_meta where key = 'schema';
