begin;

create table if not exists public.remodel_automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_key text not null,
  lead_id uuid,
  subject text not null,
  project text not null,
  status text not null check (status in ('running', 'completed', 'needs_attention')),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists remodel_automation_runs_recent
  on public.remodel_automation_runs (organization_id, automation_key, started_at desc, id desc);
create index if not exists remodel_automation_runs_attention
  on public.remodel_automation_runs (organization_id, automation_key, status, started_at desc);

alter table public.remodel_automation_runs enable row level security;
revoke all on public.remodel_automation_runs from public, anon, authenticated;
create policy remodel_automation_runs_read on public.remodel_automation_runs
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
grant select on public.remodel_automation_runs to authenticated;
grant all on public.remodel_automation_runs to service_role;

commit;
