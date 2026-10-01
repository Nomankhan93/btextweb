begin;

-- BulkText Individual-First gateway pairing lint stabilization.
-- Restores qualified gateway_pairing_codes column references after the
-- 00240 function replacement. No product or authorization behavior changes.

create or replace function public.create_gateway_pairing_code(p_organization_id uuid)
returns table(
  pairing_id uuid,
  pairing_code text,
  pairing_uri text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text;
  v_pairing_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_org(p_organization_id) then
    raise exception 'Personal workspace owner permission required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.gateway_devices d
    where d.organization_id = p_organization_id
      and d.status = 'active'
  ) then
    raise exception 'An active gateway phone is already paired. Revoke it before pairing another phone.' using errcode = '23505';
  end if;

  -- Keep at most one currently-usable pairing session for the personal workspace.
  update public.gateway_pairing_codes as pc
  set revoked_at = now()
  where pc.organization_id = p_organization_id
    and pc.claimed_at is null
    and pc.revoked_at is null
    and pc.expires_at > now();

  for v_attempt in 1..5 loop
    v_bytes := gen_random_bytes(12);
    v_code := '';
    for i in 0..11 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % char_length(v_alphabet)) + 1, 1);
    end loop;

    begin
      insert into public.gateway_pairing_codes (
        organization_id,
        code_hash,
        created_by,
        expires_at
      ) values (
        p_organization_id,
        encode(digest(v_code, 'sha256'), 'hex'),
        v_actor,
        v_expires_at
      ) returning id into v_pairing_id;
      exit;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
    end;
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_organization_id,
    v_actor,
    'gateway.pairing_created',
    'gateway_pairing',
    v_pairing_id::text,
    jsonb_build_object('expires_at', v_expires_at)
  );

  pairing_id := v_pairing_id;
  pairing_code := v_code;
  pairing_uri := 'bulktext://pair?code=' || v_code;
  expires_at := v_expires_at;
  return next;
end;
$$;

commit;
