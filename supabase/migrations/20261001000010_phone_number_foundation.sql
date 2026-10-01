begin;

create or replace function public.normalize_phone_number(
  p_raw text,
  p_default_country text default 'PK'
)
returns table(
  raw_input text,
  normalized_e164 text,
  country_iso text,
  country_calling_code text,
  national_number text,
  number_type text,
  validation_status text,
  validation_reason text,
  normalization_version text
)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_input text := trim(coalesce(p_raw, ''));
  v_country text := upper(trim(coalesce(p_default_country, 'PK')));
  v_compact text;
  v_national text;
begin
  raw_input := p_raw;
  normalized_e164 := null;
  country_iso := null;
  country_calling_code := null;
  national_number := null;
  number_type := null;
  validation_status := 'empty';
  validation_reason := 'Phone number is empty.';
  normalization_version := 'pk-mobile-v1';

  if v_country <> 'PK' then
    validation_status := 'unsupported_country';
    validation_reason := 'BulkText 0.8 currently supports Pakistan mobile numbers only.';
    return next;
    return;
  end if;

  if v_input = '' then
    return next;
    return;
  end if;

  if v_input !~ '^[0-9+() .-]+$' then
    validation_status := 'invalid_characters';
    validation_reason := 'Only digits, spaces, +, parentheses, dots and hyphens are supported.';
    return next;
    return;
  end if;

  v_compact := regexp_replace(v_input, '[() .-]', '', 'g');
  if left(v_compact, 2) = '00' then
    v_compact := '+' || substr(v_compact, 3);
  end if;

  if position('+' in v_compact) > 0 and v_compact !~ '^\+[0-9]+$' then
    validation_status := 'invalid_characters';
    validation_reason := 'The + sign is only valid at the beginning of an international number.';
    return next;
    return;
  end if;

  if left(v_compact, 1) = '+' then
    if left(v_compact, 3) <> '+92' then
      validation_status := 'unsupported_country';
      validation_reason := 'BulkText 0.8 currently supports Pakistan mobile numbers only.';
      return next;
      return;
    end if;
    v_national := substr(v_compact, 4);
  elsif left(v_compact, 2) = '92' then
    v_national := substr(v_compact, 3);
  elsif left(v_compact, 1) = '0' then
    v_national := substr(v_compact, 2);
  else
    v_national := v_compact;
  end if;

  country_iso := 'PK';
  country_calling_code := '92';
  national_number := nullif(v_national, '');

  if v_national !~ '^[0-9]+$' then
    validation_status := 'invalid_characters';
    validation_reason := 'The number contains unsupported characters.';
    return next;
    return;
  end if;

  if char_length(v_national) <> 10 then
    validation_status := 'invalid_length';
    validation_reason := 'Pakistan mobile numbers must contain 10 national digits after the country code.';
    return next;
    return;
  end if;

  if v_national !~ '^3[0-9]{9}$' then
    validation_status := 'unsupported_number_type';
    validation_reason := 'Only Pakistan mobile numbers (03xx / +923xx) are supported in this phase.';
    return next;
    return;
  end if;

  normalized_e164 := '+92' || v_national;
  number_type := 'mobile';
  validation_status := 'valid';
  validation_reason := 'Valid Pakistan mobile number.';
  return next;
end;
$$;

create or replace function public.is_valid_pk_mobile_e164(p_e164 text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_e164 ~ '^\+923[0-9]{9}$', false);
$$;

revoke all on function public.normalize_phone_number(text, text) from public, anon;
revoke all on function public.is_valid_pk_mobile_e164(text) from public, anon, authenticated;
grant execute on function public.normalize_phone_number(text, text) to authenticated, service_role;
grant execute on function public.is_valid_pk_mobile_e164(text) to service_role;

insert into public.app_meta (key, value)
values (
  'schema',
  jsonb_build_object(
    'version', '0.8.0',
    'phase', 'phone_number_foundation',
    'default_country', 'PK',
    'number_type', 'mobile',
    'normalization_version', 'pk-mobile-v1'
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

commit;
