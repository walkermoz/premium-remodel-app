begin;

alter table public.remodel_automations
  add column if not exists revision bigint not null default 1
    check (revision >= 1);

create table if not exists public.remodel_automation_revisions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_key text not null,
  revision bigint not null check (revision >= 1),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  changed_at timestamptz not null default now(),
  primary key (organization_id, automation_key, revision)
);

alter table public.remodel_automation_revisions enable row level security;
revoke all on public.remodel_automation_revisions from public, anon, authenticated;
create policy remodel_automation_revisions_read
  on public.remodel_automation_revisions for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
grant select on public.remodel_automation_revisions to authenticated;
grant all on public.remodel_automation_revisions to service_role;

insert into public.remodel_automation_revisions
  (organization_id, automation_key, revision, definition,
   actor_id, actor_name, changed_at)
select automation.organization_id, automation.automation_key,
  automation.revision, automation.definition, automation.updated_by,
  coalesce(profile.full_name, 'System'), automation.updated_at
from public.remodel_automations as automation
left join public.profiles as profile on profile.id = automation.updated_by
on conflict do nothing;

create or replace function public.remodel_save_website_lead_automation(
  p_organization_id uuid,
  p_actor_id uuid,
  p_expected_revision bigint,
  p_definition jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_definition jsonb;
  v_actor_name text;
begin
  if p_expected_revision < 0 or jsonb_typeof(p_definition) <> 'object' then
    raise exception 'Invalid automation definition';
  end if;
  select full_name into v_actor_name
  from public.profiles
  where id = p_actor_id and organization_id = p_organization_id
    and active = true and role::text in ('owner', 'admin');
  if v_actor_name is null then
    raise exception 'Only an active administrator can change automations';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'remodel-automation:' || p_organization_id::text || ':website-lead-intake', 0));

  select revision, definition into v_revision, v_definition
  from public.remodel_automations
  where organization_id = p_organization_id
    and automation_key = 'website-lead-intake'
  for update;

  if v_revision is null then
    if p_expected_revision <> 0 then
      return jsonb_build_object('result', 'conflict', 'revision', 0);
    end if;
    v_revision := 1;
    insert into public.remodel_automations
      (organization_id, automation_key, definition, revision, updated_by)
    values
      (p_organization_id, 'website-lead-intake', p_definition,
       v_revision, p_actor_id);
  else
    if v_revision <> p_expected_revision then
      return jsonb_build_object('result', 'conflict', 'revision', v_revision);
    end if;
    if v_definition = p_definition then
      return jsonb_build_object('result', 'unchanged', 'revision', v_revision);
    end if;
    v_revision := v_revision + 1;
    update public.remodel_automations
    set definition = p_definition,
        revision = v_revision,
        updated_by = p_actor_id,
        updated_at = now()
    where organization_id = p_organization_id
      and automation_key = 'website-lead-intake';
  end if;

  insert into public.remodel_automation_revisions
    (organization_id, automation_key, revision, definition,
     actor_id, actor_name)
  values
    (p_organization_id, 'website-lead-intake', v_revision,
     p_definition, p_actor_id, v_actor_name);
  return jsonb_build_object('result', 'saved', 'revision', v_revision);
end;
$$;

revoke all on function public.remodel_save_website_lead_automation(uuid,uuid,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.remodel_save_website_lead_automation(uuid,uuid,bigint,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
