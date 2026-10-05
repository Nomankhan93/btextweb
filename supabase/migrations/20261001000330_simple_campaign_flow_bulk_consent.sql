begin;

-- BulkText Web 0.16.3 — Simple Campaign Flow + Smart Number Import
-- Adds one server-side bulk consent declaration RPC for an immutable recipient preview.
-- Existing suppression, exact-SIM, authorization and durable queue semantics are unchanged.

create or replace function public.record_recipient_preview_bulk_consent(
  p_organization_id uuid,
  p_preview_id uuid,
  p_source text default 'import',
  p_evidence_note text default null,
  p_evidence_reference text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_occurred_at timestamptz := now();
  v_note text := nullif(trim(coalesce(p_evidence_note, '')), '');
  v_reference text := nullif(trim(coalesce(p_evidence_reference, '')), '');
  v_candidates integer := 0;
  v_inserted integer := 0;
  v_already_granted integer := 0;
  v_suppressed integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_contact_compliance(p_organization_id) then
    raise exception 'Personal workspace owner permission required to record bulk consent' using errcode = '42501';
  end if;

  if p_source is null or p_source not in ('web_form', 'paper_form', 'verbal', 'import', 'api', 'manual', 'other') then
    raise exception 'Unsupported consent source' using errcode = '22023';
  end if;

  if v_note is null and v_reference is null then
    raise exception 'Consent evidence note or reference is required' using errcode = '22023';
  end if;

  if char_length(coalesce(v_note, '')) > 1000 or char_length(coalesce(v_reference, '')) > 500 then
    raise exception 'Consent evidence is too long' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= v_occurred_at then
    raise exception 'Consent expiry must be in the future' using errcode = '22023';
  end if;

  perform 1
  from public.recipient_previews p
  where p.id = p_preview_id
    and p.organization_id = p_organization_id;

  if not found then
    raise exception 'Recipient preview not found' using errcode = 'P0002';
  end if;

  select
    count(*)::integer,
    count(*) filter (where s.consent_state = 'granted')::integer,
    count(*) filter (where s.suppression_state = 'suppressed')::integer
  into v_candidates, v_already_granted, v_suppressed
  from public.recipient_preview_rows r
  cross join lateral public.contact_compliance_state_internal(p_organization_id, r.normalized_e164) s
  where r.preview_id = p_preview_id
    and r.organization_id = p_organization_id
    and r.decision = 'included'
    and r.normalized_e164 is not null;

  if v_candidates = 0 then
    raise exception 'Recipient preview has no included candidates' using errcode = '22023';
  end if;

  insert into public.contact_consent_events (
    organization_id,
    normalized_e164,
    event_type,
    source,
    evidence_note,
    evidence_reference,
    occurred_at,
    expires_at,
    recorded_by
  )
  select
    p_organization_id,
    r.normalized_e164,
    'granted',
    p_source,
    v_note,
    v_reference,
    v_occurred_at,
    p_expires_at,
    v_actor
  from public.recipient_preview_rows r
  cross join lateral public.contact_compliance_state_internal(p_organization_id, r.normalized_e164) s
  where r.preview_id = p_preview_id
    and r.organization_id = p_organization_id
    and r.decision = 'included'
    and r.normalized_e164 is not null
    and s.consent_state <> 'granted'
  order by r.source_row_number, r.id;

  get diagnostics v_inserted = row_count;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id,
    v_actor,
    'contacts.bulk_consent_granted',
    'recipient_preview',
    p_preview_id::text,
    jsonb_build_object(
      'candidateRows', v_candidates,
      'newGrantEvents', v_inserted,
      'alreadyGrantedRows', v_already_granted,
      'suppressedRows', v_suppressed,
      'source', p_source,
      'evidenceReference', v_reference,
      'expiresAt', p_expires_at
    )
  );

  return jsonb_build_object(
    'candidateRows', v_candidates,
    'newGrantEvents', v_inserted,
    'alreadyGrantedRows', v_already_granted,
    'suppressedRows', v_suppressed
  );
end;
$$;

revoke all on function public.record_recipient_preview_bulk_consent(uuid, uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_recipient_preview_bulk_consent(uuid, uuid, text, text, text, timestamptz) to authenticated, service_role;

update public.app_meta
set value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
  'version', '0.16.3',
  'phase', 'simple_campaign_flow_smart_import',
  'smart_number_import_enabled', true,
  'bulk_consent_declaration_enabled', true,
  'simple_campaign_flow_enabled', true,
  'queue_enabled', true,
  'campaign_send_enabled', false
),
updated_at = now()
where key = 'schema';

commit;
