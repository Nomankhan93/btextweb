-- BulkText Individual-First schema verification through 0.14
-- Structural checks only; does not create or modify data.

do $$
declare
  v_meta jsonb;
  v_missing text[] := array[]::text[];
  v_name text;
begin
  select value into v_meta from public.app_meta where key = 'schema';

  if coalesce(v_meta ->> 'version', '') <> '0.14.0' then
    raise exception 'Expected app_meta schema version 0.14.0, got %', v_meta;
  end if;

  if coalesce(v_meta ->> 'tenant_model', '') <> 'hidden_personal_workspace' then
    raise exception 'Expected hidden_personal_workspace tenant model, got %', v_meta;
  end if;

  if coalesce((v_meta ->> 'campaign_confirmation_enabled')::boolean, false) is not true then
    raise exception 'Campaign confirmation should be enabled in 0.14 metadata';
  end if;

  if coalesce((v_meta ->> 'campaign_send_enabled')::boolean, false) is not false then
    raise exception 'Campaign sending must remain disabled in 0.14';
  end if;

  foreach v_name in array array[
    'profiles','organizations','organization_members','audit_logs',
    'gateway_devices','gateway_pairing_codes','gateway_device_credentials',
    'gateway_device_sims','gateway_device_sim_bindings',
    'contact_imports','contact_import_rows','recipient_previews','recipient_preview_rows',
    'contact_consent_events','contact_suppression_events',
    'recipient_eligibility_snapshots','recipient_eligibility_rows',
    'message_composer_drafts','campaigns','campaign_recipients'
  ] loop
    if to_regclass('public.' || v_name) is null then
      v_missing := array_append(v_missing, v_name);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'Missing required tables: %', array_to_string(v_missing, ', ');
  end if;

  if to_regclass('public.organization_invitations') is not null then
    raise exception 'Legacy organization_invitations table should not exist';
  end if;
  if to_regprocedure('public.create_organization(text)') is not null then
    raise exception 'Legacy create_organization(text) RPC should not exist';
  end if;
  if to_regprocedure('public.list_my_organizations()') is not null then
    raise exception 'Legacy list_my_organizations() RPC should not exist';
  end if;

  if to_regprocedure('public.confirm_campaign(uuid,uuid,uuid)') is null then
    raise exception 'Missing confirm_campaign(uuid,uuid,uuid) RPC';
  end if;
  if to_regprocedure('public.list_campaign_confirmations(uuid)') is null then
    raise exception 'Missing list_campaign_confirmations(uuid) RPC';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='gateway_devices'
      and indexname='gateway_devices_one_active_per_workspace'
  ) then
    raise exception 'Missing one-active-gateway-per-workspace unique index';
  end if;

  raise notice 'BulkText 0.14 Individual-First schema structural verification PASS';
end;
$$;

select key, value from public.app_meta where key = 'schema';
