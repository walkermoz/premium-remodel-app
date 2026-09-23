begin;

alter table public.remodel_records
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.remodel_records
set updated_by = created_by
where updated_by is null;

create table if not exists public.remodel_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_email text,
  action text not null check (action in ('created','updated','deleted')),
  entity_kind text not null,
  entity_id uuid not null,
  project_id uuid,
  subject text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists remodel_audit_workspace_time
  on public.remodel_audit_events (organization_id, occurred_at desc, id desc);
create index if not exists remodel_audit_project_time
  on public.remodel_audit_events (organization_id, project_id, occurred_at desc);

alter table public.remodel_audit_events enable row level security;
revoke all on public.remodel_audit_events from public, anon, authenticated;
grant select on public.remodel_audit_events to authenticated;
grant all on public.remodel_audit_events to service_role;

drop policy if exists remodel_audit_admin_read on public.remodel_audit_events;
create policy remodel_audit_admin_read on public.remodel_audit_events for select to authenticated
using (
  organization_id = (select organization_id from public.remodel_current_member())
  and exists (
    select 1 from public.remodel_current_member() member
    where member.role in ('owner','admin')
  )
);

create or replace function public.remodel_record_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_data jsonb;
  actor uuid;
  actor_profile record;
  event_action text;
  event_project uuid;
  event_subject text;
begin
  if tg_op = 'UPDATE'
     and new.data is not distinct from old.data
     and new.kind is not distinct from old.kind
     and new.project_id is not distinct from old.project_id then
    return new;
  end if;

  source_data := case when tg_op = 'DELETE' then old.data else new.data end;
  actor := case
    when tg_op = 'DELETE' then coalesce(old.updated_by, old.created_by)
    else coalesce(new.updated_by, new.created_by)
  end;
  event_action := case tg_op
    when 'INSERT' then 'created'
    when 'UPDATE' then 'updated'
    else 'deleted'
  end;
  event_project := coalesce(
    case when tg_op = 'DELETE' then old.project_id else new.project_id end,
    case
      when (case when tg_op = 'DELETE' then old.kind else new.kind end) in ('project','quote')
      then (case when tg_op = 'DELETE' then old.id else new.id end)
      else null
    end
  );
  event_subject := left(coalesce(
    source_data->>'name',
    source_data->>'title',
    source_data->>'message',
    source_data->>'summary',
    source_data->>'body',
    source_data->>'description',
    case when tg_op = 'DELETE' then old.kind else new.kind end
  ), 240);

  select p.full_name, p.email into actor_profile
  from public.profiles p
  where p.id = actor;

  insert into public.remodel_audit_events (
    organization_id,
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_kind,
    entity_id,
    project_id,
    subject,
    before_data,
    after_data
  ) values (
    case when tg_op = 'DELETE' then old.organization_id else new.organization_id end,
    actor,
    coalesce(actor_profile.full_name, 'System'),
    actor_profile.email,
    event_action,
    case when tg_op = 'DELETE' then old.kind else new.kind end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    event_project,
    event_subject,
    case when tg_op in ('UPDATE','DELETE') then old.data else null end,
    case when tg_op in ('INSERT','UPDATE') then new.data else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.remodel_record_audit() from public, anon, authenticated;

drop trigger if exists remodel_record_audit_trigger on public.remodel_records;
create trigger remodel_record_audit_trigger
after insert or update or delete on public.remodel_records
for each row execute function public.remodel_record_audit();

create or replace function public.remodel_delete_record(
  target_organization uuid,
  target_id uuid,
  target_actor uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = target_actor
      and p.organization_id = target_organization
      and p.active = true
      and p.role::text in ('owner','admin','office','crew','field')
  ) then
    raise exception 'Active workspace member required';
  end if;

  update public.remodel_records
  set updated_by = target_actor
  where organization_id = target_organization and id = target_id;

  delete from public.remodel_records
  where organization_id = target_organization and id = target_id
  returning id into removed_id;

  return removed_id is not null;
end;
$$;

revoke all on function public.remodel_delete_record(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.remodel_delete_record(uuid,uuid,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
