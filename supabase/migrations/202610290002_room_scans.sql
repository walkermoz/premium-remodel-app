begin;

create table if not exists public.remodel_room_scan_sessions (
  id uuid primary key,
  scan_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, quote_id)
    references public.remodel_records(organization_id, id) on delete cascade
);
create index if not exists remodel_room_scan_sessions_expiry
  on public.remodel_room_scan_sessions(expires_at);
alter table public.remodel_room_scan_sessions enable row level security;
revoke all on public.remodel_room_scan_sessions from public, anon, authenticated;
grant all on public.remodel_room_scan_sessions to service_role;

create table if not exists public.remodel_room_scans (
  id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  room_name text not null check (length(room_name) between 1 and 120),
  captured_at timestamptz not null,
  capture jsonb not null check (jsonb_typeof(capture) = 'object'),
  model_path text not null,
  preview_path text not null,
  metadata_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, quote_id)
    references public.remodel_records(organization_id, id) on delete cascade,
  unique (model_path),
  unique (preview_path),
  unique (metadata_path)
);
create index if not exists remodel_room_scans_quote
  on public.remodel_room_scans(organization_id, quote_id, captured_at desc);
alter table public.remodel_room_scans enable row level security;
revoke all on public.remodel_room_scans from public, anon, authenticated;
create policy remodel_room_scans_read on public.remodel_room_scans
for select to authenticated using (
  organization_id = (select organization_id from public.remodel_current_member())
);
grant select on public.remodel_room_scans to authenticated;
grant all on public.remodel_room_scans to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('remodel-files', 'remodel-files', false, 52428800, array[
  'image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv',
  'application/json','model/vnd.usdz+zip','model/vnd.usd','application/octet-stream',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
commit;
