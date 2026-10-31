create table if not exists public.remodel_pricebook_assemblies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components) = 'array'),
  revision integer not null default 1,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index if not exists remodel_pricebook_assemblies_org_category
  on public.remodel_pricebook_assemblies (organization_id, category, name);
alter table public.remodel_pricebook_assemblies enable row level security;
revoke all on public.remodel_pricebook_assemblies from public, anon, authenticated;
create policy remodel_pricebook_assemblies_read on public.remodel_pricebook_assemblies
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
grant select on public.remodel_pricebook_assemblies to authenticated;
grant all on public.remodel_pricebook_assemblies to service_role;
