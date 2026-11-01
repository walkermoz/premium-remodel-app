begin;

create table if not exists public.remodel_twilio_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  account_sid text not null,
  auth_token_ciphertext text not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.remodel_twilio_connections enable row level security;
revoke all on public.remodel_twilio_connections from public, anon, authenticated;
grant all on public.remodel_twilio_connections to service_role;

notify pgrst, 'reload schema';
commit;
