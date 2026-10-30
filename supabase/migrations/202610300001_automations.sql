begin;

create table if not exists public.remodel_automations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_key text not null check (length(trim(automation_key)) between 1 and 100),
  definition jsonb not null default '{}'::jsonb check (jsonb_typeof(definition) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (organization_id, automation_key)
);

alter table public.remodel_automations enable row level security;
revoke all on public.remodel_automations from public, anon, authenticated;
create policy remodel_automations_read on public.remodel_automations
for select to authenticated
using (organization_id = (select organization_id from public.remodel_current_member()));
grant select on public.remodel_automations to authenticated;
grant all on public.remodel_automations to service_role;

-- Add Automation beside Leads for existing roles that already manage leads.
update public.remodel_business_config as config
set navigation = case
  when config.navigation @> '["Leads"]'::jsonb then
    jsonb_insert(
      config.navigation,
      array[(
        select ordinal::text
        from jsonb_array_elements_text(config.navigation) with ordinality as item(value, ordinal)
        where item.value = 'Leads'
        limit 1
      )],
      '"Automation"'::jsonb
    )
  else config.navigation || '["Automation"]'::jsonb
end
where config.navigation <> '[]'::jsonb
  and not config.navigation @> '["Automation"]'::jsonb;

update public.remodel_business_config as config
set role_navigation = (
  select coalesce(jsonb_object_agg(role.key, case
    when role.key <> 'doorknocker'
      and jsonb_typeof(role.value) = 'array'
      and role.value @> '["Leads"]'::jsonb
      and not role.value @> '["Automation"]'::jsonb
    then role.value || '["Automation"]'::jsonb
    else role.value
  end), '{}'::jsonb)
  from jsonb_each(config.role_navigation) as role(key, value)
)
where config.role_navigation <> '{}'::jsonb;

commit;
