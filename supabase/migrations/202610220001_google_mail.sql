begin;

create table if not exists public.remodel_google_mail_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  google_account_id text not null,
  google_email text not null,
  refresh_token_ciphertext text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.remodel_google_mail_connections enable row level security;
revoke all on public.remodel_google_mail_connections from public, anon, authenticated;
grant all on public.remodel_google_mail_connections to service_role;

create table if not exists public.remodel_quote_email_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  request_id uuid not null,
  recipient_email text not null,
  sent_by uuid references public.profiles(id) on delete set null,
  state text not null check (state in ('sending', 'sent', 'failed', 'unknown')),
  google_message_id text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, request_id)
);

create index if not exists remodel_quote_email_sends_quote
  on public.remodel_quote_email_sends (organization_id, quote_id, created_at desc);

alter table public.remodel_quote_email_sends enable row level security;
revoke all on public.remodel_quote_email_sends from public, anon, authenticated;
grant all on public.remodel_quote_email_sends to service_role;

notify pgrst, 'reload schema';
commit;
