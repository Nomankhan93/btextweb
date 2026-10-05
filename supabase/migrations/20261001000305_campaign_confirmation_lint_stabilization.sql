begin;

-- BulkText 0.14 campaign confirmation SQL lint stabilization.
--
-- Corrects the two warnings reported by `supabase db lint --linked` after
-- 20261001000300_campaign_confirmation_snapshot.sql was applied:
--
-- 1. render_message_template_internal was declared IMMUTABLE even though the
--    expression path used by the function is classified STABLE.
-- 2. sms_segment_estimate_internal had the same volatility over-promise and
--    explicitly declared v_i even though an integer FOR loop creates its own
--    loop variable.
--
-- No campaign snapshot, authorization, recipient, gateway binding, queue, or
-- sending behavior is changed by this migration.

alter function public.render_message_template_internal(text,text,text,text,text,jsonb)
  stable;

create or replace function public.sms_segment_estimate_internal(p_text text)
returns table(
  sms_encoding text,
  character_count integer,
  encoding_units integer,
  segment_count integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text := coalesce(p_text, '');
  v_basic constant text := '@£$¥èéùìòÇ'||chr(10)||'Øø'||chr(13)||'ÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  v_extension constant text := '^{}'||chr(92)||'[~]|€'||chr(12);
  v_char text;
  v_gsm_units integer := 0;
  v_unicode_units integer := 0;
  v_is_gsm boolean := true;
begin
  character_count := char_length(v_text);

  if character_count = 0 then
    sms_encoding := 'GSM-7';
    encoding_units := 0;
    segment_count := 0;
    return next;
    return;
  end if;

  for v_i in 1..character_count loop
    v_char := substr(v_text, v_i, 1);

    if strpos(v_basic, v_char) > 0 then
      v_gsm_units := v_gsm_units + 1;
    elsif strpos(v_extension, v_char) > 0 then
      v_gsm_units := v_gsm_units + 2;
    else
      v_is_gsm := false;
    end if;

    v_unicode_units := v_unicode_units
      + case when octet_length(convert_to(v_char, 'UTF8')) = 4 then 2 else 1 end;
  end loop;

  if v_is_gsm then
    sms_encoding := 'GSM-7';
    encoding_units := v_gsm_units;
    segment_count := case
      when v_gsm_units <= 160 then 1
      else (v_gsm_units + 152) / 153
    end;
  else
    sms_encoding := 'Unicode';
    encoding_units := v_unicode_units;
    segment_count := case
      when v_unicode_units <= 70 then 1
      else (v_unicode_units + 66) / 67
    end;
  end if;

  return next;
end;
$$;

-- Preserve the 0.14 internal-helper privilege boundary explicitly.
revoke all on function public.render_message_template_internal(text,text,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.sms_segment_estimate_internal(text)
  from public, anon, authenticated;

grant execute on function public.render_message_template_internal(text,text,text,text,text,jsonb)
  to service_role;
grant execute on function public.sms_segment_estimate_internal(text)
  to service_role;

commit;
