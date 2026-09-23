begin;

create table if not exists public.remodel_google_calendar_connections (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  google_account_id text not null check (length(google_account_id) between 1 and 255),
  google_email text not null check (length(google_email) between 3 and 320),
  refresh_token_ciphertext text,
  calendar_id text not null check (length(calendar_id) between 1 and 1024),
  calendar_name text not null default 'Premium Remodel' check (length(calendar_name) between 1 and 255),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_synced_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 1000),
  updated_at timestamptz not null default now()
);

create index if not exists remodel_google_calendar_company
  on public.remodel_google_calendar_connections (organization_id)
  where refresh_token_ciphertext is not null;

alter table public.remodel_google_calendar_connections enable row level security;
revoke all on public.remodel_google_calendar_connections from public, anon, authenticated;
grant all on public.remodel_google_calendar_connections to service_role;

notify pgrst, 'reload schema';
commit;
