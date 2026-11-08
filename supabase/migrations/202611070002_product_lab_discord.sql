begin;

create table if not exists public.servicebuddy_product_signals (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('discord', 'system', 'in_app')),
  source_reference text,
  submitted_by text,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'new' check (status in ('new', 'considered', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.servicebuddy_product_recommendation_batches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'posted', 'resolved', 'failed')),
  cadence_key text not null unique,
  discord_channel_id text,
  discord_message_id text,
  posted_at timestamptz,
  resolved_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.servicebuddy_product_spec_versions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  version_number integer not null default 1 check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'locked', 'retired')),
  spec jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (title, version_number)
);

create table if not exists public.servicebuddy_product_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.servicebuddy_product_recommendation_batches(id) on delete cascade,
  spec_version_id uuid not null references public.servicebuddy_product_spec_versions(id) on delete restrict,
  rank integer not null check (rank between 1 and 4),
  title text not null,
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'parked', 'rejected')),
  decided_by_discord_user_id text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, rank)
);

create table if not exists public.servicebuddy_product_decisions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.servicebuddy_product_recommendations(id) on delete cascade,
  discord_interaction_id text not null unique,
  discord_user_id text not null,
  action text not null check (action in ('approve', 'park', 'reject')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.servicebuddy_product_questions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.servicebuddy_product_recommendations(id) on delete cascade,
  discord_interaction_id text not null unique,
  discord_user_id text not null,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists servicebuddy_product_recommendations_batch_status_idx
  on public.servicebuddy_product_recommendations(batch_id, status);
create index if not exists servicebuddy_product_signals_status_created_idx
  on public.servicebuddy_product_signals(status, created_at desc);

alter table public.servicebuddy_product_signals enable row level security;
alter table public.servicebuddy_product_recommendation_batches enable row level security;
alter table public.servicebuddy_product_spec_versions enable row level security;
alter table public.servicebuddy_product_recommendations enable row level security;
alter table public.servicebuddy_product_decisions enable row level security;
alter table public.servicebuddy_product_questions enable row level security;

-- These are platform-control records. No browser policies are intentionally
-- created; only the server's service-role client may read or mutate them.

commit;
