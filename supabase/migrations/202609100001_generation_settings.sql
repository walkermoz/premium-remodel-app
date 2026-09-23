begin;
create table if not exists public.remodel_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  generation_default_model text not null check (length(generation_default_model) between 1 and 150),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.remodel_settings enable row level security;
drop policy if exists remodel_settings_company_read on public.remodel_settings;
create policy remodel_settings_company_read on public.remodel_settings for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
revoke all on public.remodel_settings from anon, authenticated;
grant select on public.remodel_settings to authenticated;
grant all on public.remodel_settings to service_role;
notify pgrst, 'reload schema';
commit;
