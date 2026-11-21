begin;
create table if not exists public.remodel_operating_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.remodel_operating_settings enable row level security;
revoke all on public.remodel_operating_settings from anon, authenticated;
grant all on public.remodel_operating_settings to service_role;
comment on table public.remodel_operating_settings is 'Tenant-owned hours, reusable field/form definitions, invoice, communication and portal defaults. Access through authenticated application APIs only.';
commit;
