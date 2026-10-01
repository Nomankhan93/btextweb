begin;

create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.app_meta is 'Foundation-only application metadata. User-facing tenant data is introduced in later migrations.';

alter table public.app_meta enable row level security;

insert into public.app_meta (key, value)
values ('schema', jsonb_build_object('version', '0.4.0', 'phase', 'web_cloud_foundation'))
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit)
values ('private-uploads', 'private-uploads', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- No client policies are intentionally created in 0.4.
-- RLS remains deny-by-default until organization/auth rules arrive in 0.5.

commit;
