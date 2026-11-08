begin;

alter table public.servicebuddy_product_recommendation_batches
  add column if not exists discord_message_ids jsonb not null default '[]'::jsonb,
  add column if not exists discord_layout_version integer not null default 1;

-- Older slash-command captures used the channel as their reference, so
-- preserve every signal while making those duplicate references unique.
with duplicate_references as (
  select id,
    row_number() over (partition by source_reference order by created_at, id) as position
  from public.servicebuddy_product_signals
  where source_reference is not null
)
update public.servicebuddy_product_signals as signal
set source_reference = signal.source_reference || ':' || signal.id::text
from duplicate_references
where signal.id = duplicate_references.id
  and duplicate_references.position > 1;

create unique index if not exists servicebuddy_product_signals_source_reference_idx
  on public.servicebuddy_product_signals(source_reference)
  where source_reference is not null;

create table if not exists public.servicebuddy_product_implementations (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null unique
    references public.servicebuddy_product_recommendations(id) on delete restrict,
  spec_version_id uuid not null
    references public.servicebuddy_product_spec_versions(id) on delete restrict,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'pr_open', 'awaiting_approval', 'merge_approved',
    'merging', 'deployed', 'blocked', 'failed', 'rejected'
  )),
  codex_agent_id text,
  codex_run_id text,
  codex_model text,
  branch_name text,
  pr_url text,
  pr_number integer,
  head_sha text,
  preview_url text,
  checks jsonb not null default '{}'::jsonb,
  approval_discord_message_id text,
  approval_discord_channel_id text,
  approved_by_discord_user_id text,
  approval_interaction_id text unique,
  approved_at timestamptz,
  merge_sha text,
  production_url text,
  failure_message text,
  claimed_at timestamptz,
  started_at timestamptz,
  pr_opened_at timestamptz,
  evidence_posted_at timestamptz,
  merged_at timestamptz,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists servicebuddy_product_implementations_status_idx
  on public.servicebuddy_product_implementations(status, created_at);
create unique index if not exists servicebuddy_product_implementations_pr_url_idx
  on public.servicebuddy_product_implementations(pr_url)
  where pr_url is not null;
create unique index if not exists servicebuddy_product_implementations_merge_sha_idx
  on public.servicebuddy_product_implementations(merge_sha)
  where merge_sha is not null;

create table if not exists public.servicebuddy_product_generation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'blocked')),
  signal_ids uuid[] not null default '{}',
  codex_agent_id text,
  codex_run_id text,
  codex_model text,
  result_summary text,
  failure_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists servicebuddy_product_generation_runs_active_idx
  on public.servicebuddy_product_generation_runs((true))
  where status = 'running';

alter table public.servicebuddy_product_implementations enable row level security;
alter table public.servicebuddy_product_generation_runs enable row level security;

-- The operator wrote several messages immediately before the command bridge
-- became active. Backfill that short launch window; message IDs remain unique,
-- so already processed commands cannot run twice.
update public.servicebuddy_discord_command_settings
set enabled_at = least(enabled_at, '2026-11-07T00:00:00Z'::timestamptz)
where id = true;

commit;
