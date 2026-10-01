begin;

-- BulkText Web 0.12.0 — Message Composer & Personalization
-- Adds editable message drafts and live personalization source data backed by immutable
-- eligibility snapshots. SMS encoding/segment calculation, campaign confirmation, queueing
-- and sending remain disabled until later roadmap phases.

create or replace function public.can_manage_message_composer(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.org_role(p_organization_id) in ('owner', 'admin', 'campaign_manager'), false);
$$;

create or replace function public.message_template_variables_internal(p_template text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct token order by token), array[]::text[])
  from (
    select
      case
        when trim(capture[1]) like 'custom:%'
          then 'custom:' || trim(substr(trim(capture[1]), 8))
        else trim(capture[1])
      end as token
    from regexp_matches(
      coalesce(p_template, ''),
      '\{\{[[:space:]]*([^{}]+)[[:space:]]*\}\}',
      'g'
    ) as matches(capture)
  ) tokens
  where char_length(token) > 0;
$$;

create or replace function public.validate_message_template_internal(p_template text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_template text := coalesce(p_template, '');
  v_remainder text;
  v_variables text[];
  v_token text;
  v_custom_key text;
begin
  if char_length(trim(v_template)) = 0 then
    raise exception 'Message text is required' using errcode = '22023';
  end if;

  if char_length(v_template) > 4000 then
    raise exception 'Message template cannot exceed 4000 characters' using errcode = '22023';
  end if;

  -- Remove all tokens that match the supported v1 grammar. Any remaining braces mean
  -- an unknown token or malformed token syntax was supplied.
  v_remainder := regexp_replace(
    v_template,
    '\{\{[[:space:]]*(name|first_name|last_name|phone|custom:[^{}]{1,80})[[:space:]]*\}\}',
    '',
    'g'
  );

  if position('{{' in v_remainder) > 0 or position('}}' in v_remainder) > 0 then
    raise exception 'Message contains an unsupported or malformed personalization token' using errcode = '22023';
  end if;

  v_variables := public.message_template_variables_internal(v_template);

  foreach v_token in array v_variables loop
    if v_token in ('name', 'first_name', 'last_name', 'phone') then
      continue;
    end if;

    if left(v_token, 7) = 'custom:' then
      v_custom_key := trim(substr(v_token, 8));
      if char_length(v_custom_key) = 0 or char_length(v_custom_key) > 80 then
        raise exception 'Custom personalization field names must contain 1 to 80 characters' using errcode = '22023';
      end if;
      continue;
    end if;

    raise exception 'Unsupported personalization token: %', v_token using errcode = '22023';
  end loop;

  return v_variables;
end;
$$;

create table if not exists public.message_composer_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  eligibility_snapshot_id uuid not null references public.recipient_eligibility_snapshots(id) on delete restrict,
  title text not null,
  message_template text not null,
  syntax_version text not null default 'bulktext-template-v1' check (syntax_version = 'bulktext-template-v1'),
  template_variables text[] not null default array[]::text[],
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(title)) between 1 and 120),
  check (char_length(message_template) between 1 and 4000)
);

create index if not exists message_composer_drafts_org_updated_idx
  on public.message_composer_drafts (organization_id, updated_at desc);

create index if not exists message_composer_drafts_snapshot_idx
  on public.message_composer_drafts (eligibility_snapshot_id, updated_at desc);

alter table public.message_composer_drafts enable row level security;

create policy "message_composer_drafts_select_members"
on public.message_composer_drafts
for select
to authenticated
using (public.is_org_member(organization_id));

create or replace function public.list_message_composer_sources(p_organization_id uuid)
returns table(
  eligibility_snapshot_id uuid,
  recipient_preview_id uuid,
  eligibility_revision integer,
  eligibility_policy_version text,
  candidate_rows integer,
  eligible_rows integer,
  source_filename text,
  preview_revision integer,
  snapshot_created_at timestamptz
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
    raise exception 'Organization membership required' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.recipient_preview_id,
    s.revision,
    s.policy_version,
    s.candidate_rows,
    s.eligible_rows,
    i.source_filename,
    p.revision,
    s.created_at
  from public.recipient_eligibility_snapshots s
  join public.recipient_previews p on p.id = s.recipient_preview_id
  join public.contact_imports i on i.id = p.import_id
  where s.organization_id = p_organization_id
    and s.eligible_rows > 0
  order by s.created_at desc, s.revision desc;
end;
$$;

create or replace function public.get_message_personalization_source_rows(
  p_organization_id uuid,
  p_eligibility_snapshot_id uuid
)
returns table(
  eligibility_row_id bigint,
  preview_row_id bigint,
  source_row_number integer,
  display_name text,
  first_name text,
  last_name text,
  normalized_e164 text,
  custom_fields jsonb
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
    raise exception 'Organization membership required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.recipient_eligibility_snapshots s
    where s.id = p_eligibility_snapshot_id
      and s.organization_id = p_organization_id
  ) then
    raise exception 'Eligibility snapshot not found' using errcode = 'P0002';
  end if;

  return query
  select
    e.id,
    e.preview_row_id,
    e.source_row_number,
    e.display_name,
    p.first_name,
    p.last_name,
    e.normalized_e164,
    p.custom_fields
  from public.recipient_eligibility_rows e
  join public.recipient_preview_rows p on p.id = e.preview_row_id
  where e.organization_id = p_organization_id
    and e.snapshot_id = p_eligibility_snapshot_id
    and e.eligibility_state = 'eligible'
  order by e.source_row_number, e.id;
end;
$$;

create or replace function public.list_message_composer_drafts(p_organization_id uuid)
returns table(
  draft_id uuid,
  eligibility_snapshot_id uuid,
  title text,
  message_template text,
  syntax_version text,
  template_variables text[],
  eligible_rows integer,
  source_filename text,
  eligibility_revision integer,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid
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
    raise exception 'Organization membership required' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.eligibility_snapshot_id,
    d.title,
    d.message_template,
    d.syntax_version,
    d.template_variables,
    s.eligible_rows,
    i.source_filename,
    s.revision,
    d.created_at,
    d.updated_at,
    d.created_by,
    d.updated_by
  from public.message_composer_drafts d
  join public.recipient_eligibility_snapshots s on s.id = d.eligibility_snapshot_id
  join public.recipient_previews p on p.id = s.recipient_preview_id
  join public.contact_imports i on i.id = p.import_id
  where d.organization_id = p_organization_id
  order by d.updated_at desc, d.created_at desc;
end;
$$;

create or replace function public.save_message_composer_draft(
  p_organization_id uuid,
  p_draft_id uuid,
  p_eligibility_snapshot_id uuid,
  p_title text,
  p_message_template text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_template text := coalesce(p_message_template, '');
  v_variables text[];
  v_draft_id uuid;
  v_action text;
  v_token text;
  v_custom_key text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_message_composer(p_organization_id) then
    raise exception 'Owner, Admin or Campaign Manager permission required to manage message drafts' using errcode = '42501';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception 'Draft title must contain 1 to 120 characters' using errcode = '22023';
  end if;

  v_variables := public.validate_message_template_internal(v_template);

  if not exists (
    select 1
    from public.recipient_eligibility_snapshots s
    where s.id = p_eligibility_snapshot_id
      and s.organization_id = p_organization_id
      and s.eligible_rows > 0
  ) then
    raise exception 'A matching eligibility snapshot with at least one eligible recipient is required' using errcode = '22023';
  end if;

  foreach v_token in array v_variables loop
    if left(v_token, 7) = 'custom:' then
      v_custom_key := substr(v_token, 8);
      if not exists (
        select 1
        from public.recipient_eligibility_rows e
        join public.recipient_preview_rows p on p.id = e.preview_row_id
        where e.snapshot_id = p_eligibility_snapshot_id
          and e.organization_id = p_organization_id
          and e.eligibility_state = 'eligible'
          and p.custom_fields ? v_custom_key
      ) then
        raise exception 'Custom personalization field is not present in the selected eligibility snapshot: %', v_custom_key using errcode = '22023';
      end if;
    end if;
  end loop;

  if p_draft_id is null then
    insert into public.message_composer_drafts (
      organization_id, eligibility_snapshot_id, title, message_template,
      template_variables, created_by, updated_by
    ) values (
      p_organization_id, p_eligibility_snapshot_id, v_title, v_template,
      v_variables, v_actor, v_actor
    ) returning id into v_draft_id;
    v_action := 'composer.draft_created';
  else
    perform 1
    from public.message_composer_drafts d
    where d.id = p_draft_id
      and d.organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Message draft not found' using errcode = 'P0002';
    end if;

    update public.message_composer_drafts
    set eligibility_snapshot_id = p_eligibility_snapshot_id,
        title = v_title,
        message_template = v_template,
        template_variables = v_variables,
        updated_by = v_actor,
        updated_at = now()
    where id = p_draft_id
    returning id into v_draft_id;
    v_action := 'composer.draft_updated';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id,
    v_actor,
    v_action,
    'message_composer_draft',
    v_draft_id::text,
    jsonb_build_object(
      'eligibilitySnapshotId', p_eligibility_snapshot_id,
      'syntaxVersion', 'bulktext-template-v1',
      'templateVariables', to_jsonb(v_variables)
    )
  );

  return v_draft_id;
end;
$$;

create or replace function public.delete_message_composer_draft(
  p_organization_id uuid,
  p_draft_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_message_composer(p_organization_id) then
    raise exception 'Owner, Admin or Campaign Manager permission required to delete message drafts' using errcode = '42501';
  end if;

  delete from public.message_composer_drafts d
  where d.id = p_draft_id
    and d.organization_id = p_organization_id;

  if not found then
    raise exception 'Message draft not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id,
    v_actor,
    'composer.draft_deleted',
    'message_composer_draft',
    p_draft_id::text,
    '{}'::jsonb
  );
end;
$$;

revoke all on public.message_composer_drafts from public, anon, authenticated;
grant select on public.message_composer_drafts to authenticated;
grant all on public.message_composer_drafts to service_role;

revoke all on function public.can_manage_message_composer(uuid) from public, anon;
revoke all on function public.message_template_variables_internal(text) from public, anon, authenticated;
revoke all on function public.validate_message_template_internal(text) from public, anon, authenticated;
revoke all on function public.list_message_composer_sources(uuid) from public, anon;
revoke all on function public.get_message_personalization_source_rows(uuid, uuid) from public, anon;
revoke all on function public.list_message_composer_drafts(uuid) from public, anon;
revoke all on function public.save_message_composer_draft(uuid, uuid, uuid, text, text) from public, anon;
revoke all on function public.delete_message_composer_draft(uuid, uuid) from public, anon;

grant execute on function public.can_manage_message_composer(uuid) to authenticated, service_role;
grant execute on function public.message_template_variables_internal(text) to service_role;
grant execute on function public.validate_message_template_internal(text) to service_role;
grant execute on function public.list_message_composer_sources(uuid) to authenticated, service_role;
grant execute on function public.get_message_personalization_source_rows(uuid, uuid) to authenticated, service_role;
grant execute on function public.list_message_composer_drafts(uuid) to authenticated, service_role;
grant execute on function public.save_message_composer_draft(uuid, uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.delete_message_composer_draft(uuid, uuid) to authenticated, service_role;

insert into public.app_meta (key, value)
values (
  'schema',
  jsonb_build_object(
    'version', '0.12.0',
    'phase', 'message_composer_personalization',
    'default_country', 'PK',
    'number_type', 'mobile',
    'normalization_version', 'pk-mobile-v1',
    'recipient_validation_version', 'recipient-validation-v1',
    'consent_suppression_policy_version', 'consent-suppression-v1',
    'message_template_syntax_version', 'bulktext-template-v1',
    'message_template_max_characters', 4000,
    'consent_required_for_eligibility', true,
    'suppression_overrides_consent', true,
    'sms_segment_calculator_enabled', false,
    'campaign_confirmation_enabled', false,
    'campaign_send_enabled', false
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

commit;
