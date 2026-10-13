begin;

-- BulkText Web 0.20.4 — Recipient Import Reliability & Scale
-- Removes the historical 5 MB / 5,000-row product caps and replaces the
-- single giant JSON RPC with bounded, idempotent staging batches.
-- Send authorization, queueing, callbacks, recovery and SIM contracts are untouched.

alter table public.contact_imports
  drop constraint if exists contact_imports_source_size_bytes_check;
alter table public.contact_imports
  add constraint contact_imports_source_size_bytes_check
  check (source_size_bytes >= 1);

alter table public.contact_imports
  drop constraint if exists contact_imports_total_rows_check;
alter table public.contact_imports
  add constraint contact_imports_total_rows_check
  check (total_rows >= 0);

alter table public.contact_imports
  drop constraint if exists contact_imports_status_check;
alter table public.contact_imports
  add constraint contact_imports_status_check
  check (status in ('staging', 'staged'));

create index if not exists contact_import_rows_import_e164_idx
  on public.contact_import_rows (import_id, normalized_e164)
  where normalized_e164 is not null;

-- Direct authenticated table reads must not expose an unfinished staging session.
-- Security-definer staging/finalization functions continue to own all mutations.
drop policy if exists "contact_imports_select_members" on public.contact_imports;
create policy "contact_imports_select_members"
on public.contact_imports
for select
to authenticated
using (public.is_org_member(organization_id) and status = 'staged');

drop policy if exists "contact_import_rows_select_members" on public.contact_import_rows;
create policy "contact_import_rows_select_members"
on public.contact_import_rows
for select
to authenticated
using (
  public.is_org_member(organization_id)
  and exists (
    select 1
    from public.contact_imports i
    where i.id = contact_import_rows.import_id
      and i.organization_id = contact_import_rows.organization_id
      and i.status = 'staged'
  )
);

create or replace function public.begin_contact_import(
  p_organization_id uuid,
  p_source_filename text,
  p_source_type text,
  p_source_size_bytes bigint,
  p_source_sha256 text,
  p_sheet_name text,
  p_headers jsonb,
  p_column_mapping jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_import_id uuid;
  v_filename text := trim(coalesce(p_source_filename, ''));
  v_sha text := lower(trim(coalesce(p_source_sha256, '')));
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_stage_contact_imports(p_organization_id) then
    raise exception 'Personal workspace owner permission required to stage imports' using errcode = '42501';
  end if;
  if char_length(v_filename) < 1 or char_length(v_filename) > 255 then
    raise exception 'Source filename must be between 1 and 255 characters' using errcode = '22023';
  end if;
  if p_source_type not in ('csv', 'xlsx') then
    raise exception 'Source type must be csv or xlsx' using errcode = '22023';
  end if;
  if p_source_size_bytes is null or p_source_size_bytes < 1 then
    raise exception 'Import file size must be at least 1 byte' using errcode = '22023';
  end if;
  if v_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'Source SHA-256 fingerprint is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_headers) <> 'array' or jsonb_array_length(p_headers) < 1 or jsonb_array_length(p_headers) > 100 then
    raise exception 'Import headers must contain between 1 and 100 columns' using errcode = '22023';
  end if;
  if jsonb_typeof(p_column_mapping) <> 'object' or trim(coalesce(p_column_mapping->>'phone', '')) = '' then
    raise exception 'A phone column mapping is required' using errcode = '22023';
  end if;
  if not (p_headers @> jsonb_build_array(p_column_mapping->>'phone')) then
    raise exception 'Mapped phone column is not present in the import headers' using errcode = '22023';
  end if;

  insert into public.contact_imports (
    organization_id, uploaded_by, source_filename, source_type, source_size_bytes,
    source_sha256, sheet_name, headers, column_mapping, total_rows, status
  ) values (
    p_organization_id, v_actor, v_filename, p_source_type, p_source_size_bytes,
    v_sha, nullif(trim(coalesce(p_sheet_name, '')), ''), p_headers, p_column_mapping, 0, 'staging'
  ) returning id into v_import_id;

  return v_import_id;
end;
$$;

create or replace function public.append_contact_import_rows(
  p_organization_id uuid,
  p_import_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_row jsonb;
  v_row_index integer := 0;
  v_source_row_number integer;
  v_raw_data jsonb;
  v_raw_phone text;
  v_custom_fields jsonb;
  v_normalized_e164 text;
  v_validation_status text;
  v_validation_reason text;
  v_duplicate boolean;
  v_inserted integer := 0;
  v_existing_raw_data jsonb;
  v_existing_raw_phone text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_stage_contact_imports(p_organization_id) then
    raise exception 'Personal workspace owner permission required to stage imports' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'Import staging batches must contain between 1 and 500 rows' using errcode = '22023';
  end if;

  select i.status
    into v_status
  from public.contact_imports i
  where i.id = p_import_id
    and i.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Import staging session not found' using errcode = 'P0002';
  end if;
  if v_status <> 'staging' then
    raise exception 'Import staging session is already finalized' using errcode = '55000';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_index := v_row_index + 1;
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Import row % must be a JSON object', v_row_index using errcode = '22023';
    end if;

    if coalesce(v_row->>'sourceRowNumber', '') ~ '^[0-9]+$' then
      v_source_row_number := (v_row->>'sourceRowNumber')::integer;
    else
      raise exception 'Every staged row must include its source row number' using errcode = '22023';
    end if;
    if v_source_row_number < 2 then
      raise exception 'Import row number must be 2 or greater' using errcode = '22023';
    end if;

    v_raw_data := coalesce(v_row->'rawData', '{}'::jsonb);
    v_custom_fields := coalesce(v_row->'customFields', '{}'::jsonb);
    if jsonb_typeof(v_raw_data) <> 'object' or jsonb_typeof(v_custom_fields) <> 'object' then
      raise exception 'Import row rawData and customFields must be JSON objects' using errcode = '22023';
    end if;
    v_raw_phone := coalesce(v_row->>'rawPhone', '');

    select r.raw_data, r.raw_phone
      into v_existing_raw_data, v_existing_raw_phone
    from public.contact_import_rows r
    where r.import_id = p_import_id
      and r.source_row_number = v_source_row_number;

    if found then
      if v_existing_raw_data = v_raw_data and v_existing_raw_phone = v_raw_phone then
        continue; -- idempotent retry after a lost client response
      end if;
      raise exception 'Import row % conflicts with an already staged source row', v_source_row_number using errcode = '40001';
    end if;

    select normalized_e164, validation_status, validation_reason
      into v_normalized_e164, v_validation_status, v_validation_reason
    from public.normalize_phone_number(v_raw_phone, 'PK')
    limit 1;

    v_duplicate := false;
    if v_validation_status = 'valid' and v_normalized_e164 is not null then
      select exists (
        select 1
        from public.contact_import_rows r
        where r.import_id = p_import_id
          and r.normalized_e164 = v_normalized_e164
      ) into v_duplicate;
    end if;

    insert into public.contact_import_rows (
      import_id, organization_id, source_row_number, raw_data, raw_phone,
      normalized_e164, phone_validation_status, phone_validation_reason,
      first_name, last_name, display_name, custom_fields, duplicate_in_file
    ) values (
      p_import_id,
      p_organization_id,
      v_source_row_number,
      v_raw_data,
      v_raw_phone,
      v_normalized_e164,
      v_validation_status,
      v_validation_reason,
      nullif(trim(coalesce(v_row->>'firstName', '')), ''),
      nullif(trim(coalesce(v_row->>'lastName', '')), ''),
      nullif(trim(coalesce(v_row->>'displayName', '')), ''),
      v_custom_fields,
      v_duplicate
    );
    v_inserted := v_inserted + 1;
  end loop;

  update public.contact_imports
  set total_rows = total_rows + v_inserted
  where id = p_import_id
    and organization_id = p_organization_id;

  return v_inserted;
end;
$$;

create or replace function public.finalize_contact_import(
  p_organization_id uuid,
  p_import_id uuid,
  p_expected_total_rows integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_import public.contact_imports%rowtype;
  v_actual integer;
  v_valid integer;
  v_invalid integer;
  v_duplicates integer;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_stage_contact_imports(p_organization_id) then
    raise exception 'Personal workspace owner permission required to finalize imports' using errcode = '42501';
  end if;
  if p_expected_total_rows is null or p_expected_total_rows < 1 then
    raise exception 'Expected import row count must be positive' using errcode = '22023';
  end if;

  select i.* into v_import
  from public.contact_imports i
  where i.id = p_import_id
    and i.organization_id = p_organization_id
  for update;
  if v_import.id is null then
    raise exception 'Import staging session not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_actual
  from public.contact_import_rows r
  where r.import_id = p_import_id
    and r.organization_id = p_organization_id;

  if v_actual <> p_expected_total_rows then
    raise exception 'Import staging is incomplete: expected % rows but found %', p_expected_total_rows, v_actual using errcode = '40001';
  end if;

  if v_import.status = 'staged' then
    if v_import.total_rows <> v_actual then
      raise exception 'Finalized import row count changed unexpectedly' using errcode = '40001';
    end if;
    return; -- idempotent finalize retry
  end if;

  with ranked as (
    select
      r.id,
      case
        when r.phone_validation_status = 'valid' and r.normalized_e164 is not null
          then row_number() over (partition by r.normalized_e164 order by r.source_row_number, r.id)
        else 1
      end as canonical_rank
    from public.contact_import_rows r
    where r.import_id = p_import_id
      and r.organization_id = p_organization_id
  )
  update public.contact_import_rows r
  set duplicate_in_file = ranked.canonical_rank > 1
  from ranked
  where r.id = ranked.id;

  select
    count(*) filter (where r.phone_validation_status = 'valid')::integer,
    count(*) filter (where r.phone_validation_status <> 'valid')::integer,
    count(*) filter (where r.duplicate_in_file)::integer
  into v_valid, v_invalid, v_duplicates
  from public.contact_import_rows r
  where r.import_id = p_import_id
    and r.organization_id = p_organization_id;

  update public.contact_imports
  set total_rows = v_actual,
      valid_phone_rows = v_valid,
      invalid_phone_rows = v_invalid,
      duplicate_phone_rows = v_duplicates,
      status = 'staged'
  where id = p_import_id
    and organization_id = p_organization_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_organization_id,
    v_actor,
    'contacts.import_staged',
    'contact_import',
    p_import_id::text,
    jsonb_build_object(
      'filename', v_import.source_filename,
      'sourceType', v_import.source_type,
      'rows', v_actual,
      'validPhoneRows', v_valid,
      'invalidPhoneRows', v_invalid,
      'duplicatePhoneRows', v_duplicates,
      'stagingMode', 'batched-v1'
    )
  );
end;
$$;

create or replace function public.abort_contact_import(
  p_organization_id uuid,
  p_import_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_stage_contact_imports(p_organization_id) then
    raise exception 'Personal workspace owner permission required to abort imports' using errcode = '42501';
  end if;

  delete from public.contact_imports i
  where i.id = p_import_id
    and i.organization_id = p_organization_id
    and i.status = 'staging';
end;
$$;

-- Compatibility RPC: callers that still submit one JSON array no longer inherit the
-- historical 5,000-row/file-size cap. New web code uses the batched RPCs above.
create or replace function public.create_contact_import(
  p_organization_id uuid,
  p_source_filename text,
  p_source_type text,
  p_source_size_bytes bigint,
  p_source_sha256 text,
  p_sheet_name text,
  p_headers jsonb,
  p_column_mapping jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import_id uuid;
  v_total integer;
  v_offset integer := 0;
  v_batch jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'Import must contain at least one data row' using errcode = '22023';
  end if;

  v_import_id := public.begin_contact_import(
    p_organization_id, p_source_filename, p_source_type, p_source_size_bytes,
    p_source_sha256, p_sheet_name, p_headers, p_column_mapping
  );
  v_total := jsonb_array_length(p_rows);

  while v_offset < v_total loop
    select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb)
      into v_batch
    from jsonb_array_elements(p_rows) with ordinality as e(value, ordinality)
    where e.ordinality > v_offset
      and e.ordinality <= v_offset + 500;

    perform public.append_contact_import_rows(p_organization_id, v_import_id, v_batch);
    v_offset := v_offset + 500;
  end loop;

  perform public.finalize_contact_import(p_organization_id, v_import_id, v_total);
  return v_import_id;
end;
$$;

-- Incomplete staging sessions are not product history and cannot be selected for a
-- recipient preview even if a client obtains the temporary import id.
create or replace function public.enforce_finalized_import_for_recipient_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.contact_imports i
    where i.id = new.import_id
      and i.organization_id = new.organization_id
      and i.status = 'staged'
  ) then
    raise exception 'Recipient previews require a finalized import' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists recipient_previews_finalized_import_guard on public.recipient_previews;
create trigger recipient_previews_finalized_import_guard
before insert on public.recipient_previews
for each row execute function public.enforce_finalized_import_for_recipient_preview();

create or replace function public.list_contact_imports(p_organization_id uuid)
returns table(
  import_id uuid,
  source_filename text,
  source_type text,
  source_size_bytes bigint,
  source_sha256 text,
  sheet_name text,
  total_rows integer,
  valid_phone_rows integer,
  invalid_phone_rows integer,
  duplicate_phone_rows integer,
  status text,
  created_at timestamptz,
  uploaded_by uuid
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
    i.id, i.source_filename, i.source_type, i.source_size_bytes, i.source_sha256,
    i.sheet_name, i.total_rows, i.valid_phone_rows, i.invalid_phone_rows,
    i.duplicate_phone_rows, i.status, i.created_at, i.uploaded_by
  from public.contact_imports i
  where i.organization_id = p_organization_id
    and i.status = 'staged'
  order by i.created_at desc, i.id desc
  limit 100;
end;
$$;

revoke all on function public.begin_contact_import(uuid, text, text, bigint, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.append_contact_import_rows(uuid, uuid, jsonb) from public, anon;
revoke all on function public.finalize_contact_import(uuid, uuid, integer) from public, anon;
revoke all on function public.abort_contact_import(uuid, uuid) from public, anon;
revoke all on function public.enforce_finalized_import_for_recipient_preview() from public, anon, authenticated;

grant execute on function public.begin_contact_import(uuid, text, text, bigint, text, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.append_contact_import_rows(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.finalize_contact_import(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.abort_contact_import(uuid, uuid) to authenticated, service_role;
grant execute on function public.enforce_finalized_import_for_recipient_preview() to service_role;

update public.app_meta
set value = (
      coalesce(value, '{}'::jsonb)
      - 'max_import_rows'
      - 'max_import_file_bytes'
    ) || jsonb_build_object(
      'version', '0.18.5',
      'phase', 'recipient_import_reliability_scale',
      'import_file_types', jsonb_build_array('csv', 'xlsx'),
      'import_staging_mode', 'batched-v1',
      'import_batch_rows', 250,
      'import_fixed_file_size_cap', false,
      'import_fixed_row_cap', false
    ),
    updated_at = now()
where key = 'schema';

commit;
