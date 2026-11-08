begin;

create table if not exists public.servicebuddy_discord_command_settings (
  id boolean primary key default true check (id),
  enabled_at timestamptz not null default now()
);

insert into public.servicebuddy_discord_command_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.servicebuddy_discord_operator_commands (
  id uuid primary key default gen_random_uuid(),
  discord_message_id text not null unique,
  discord_channel_id text not null,
  discord_user_id text not null,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'new'
    check (status in ('new', 'claimed', 'completed', 'failed', 'blocked')),
  discord_created_at timestamptz not null,
  claimed_at timestamptz,
  finished_at timestamptz,
  result_summary text,
  notified_at timestamptz,
  discord_response_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists servicebuddy_discord_operator_commands_status_idx
  on public.servicebuddy_discord_operator_commands(status, discord_created_at);

alter table public.servicebuddy_discord_command_settings enable row level security;
alter table public.servicebuddy_discord_operator_commands enable row level security;

-- This is a platform-control inbox. Browser clients intentionally have no
-- policies; only the server service role and the local Codex worker may use it.

commit;
