begin;

alter table public.profiles
  add column if not exists remodel_updated_by uuid references public.profiles(id) on delete set null;

create or replace function public.remodel_profile_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile record;
  event_action text;
  event_subject text;
begin
  if new.remodel_updated_by is null
     or new.role::text not in ('owner','admin','office','crew','field') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.full_name is not distinct from old.full_name
     and new.email is not distinct from old.email
     and new.role is not distinct from old.role
     and new.active is not distinct from old.active then
    return new;
  end if;

  event_action := case
    when tg_op = 'INSERT' then 'created'
    when old.active = true and new.active = false then 'deleted'
    else 'updated'
  end;
  event_subject := coalesce(nullif(new.full_name, ''), new.email, 'Team member');

  select p.full_name, p.email into actor_profile
  from public.profiles p
  where p.id = new.remodel_updated_by;

  insert into public.remodel_audit_events (
    organization_id, actor_id, actor_name, actor_email, action, entity_kind,
    entity_id, subject, before_data, after_data
  ) values (
    new.organization_id,
    new.remodel_updated_by,
    coalesce(actor_profile.full_name, 'System'),
    actor_profile.email,
    event_action,
    'teammate',
    new.id,
    event_subject,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'name', old.full_name, 'email', old.email, 'role', old.role::text, 'active', old.active
    ) else null end,
    jsonb_build_object(
      'name', new.full_name, 'email', new.email, 'role', new.role::text, 'active', new.active
    )
  );

  return new;
end;
$$;

revoke all on function public.remodel_profile_audit() from public, anon, authenticated;
drop trigger if exists remodel_profile_audit_trigger on public.profiles;
create trigger remodel_profile_audit_trigger
after insert or update on public.profiles
for each row execute function public.remodel_profile_audit();

create or replace function public.remodel_setting_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile record;
begin
  if tg_op = 'UPDATE'
     and new.generation_default_model is not distinct from old.generation_default_model then
    return new;
  end if;

  select p.full_name, p.email into actor_profile
  from public.profiles p
  where p.id = new.updated_by;

  insert into public.remodel_audit_events (
    organization_id, actor_id, actor_name, actor_email, action, entity_kind,
    entity_id, subject, before_data, after_data
  ) values (
    new.organization_id,
    new.updated_by,
    coalesce(actor_profile.full_name, 'System'),
    actor_profile.email,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    'setting',
    new.organization_id,
    'Default image model',
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'defaultModel', old.generation_default_model
    ) else null end,
    jsonb_build_object('defaultModel', new.generation_default_model)
  );

  return new;
end;
$$;

revoke all on function public.remodel_setting_audit() from public, anon, authenticated;
drop trigger if exists remodel_setting_audit_trigger on public.remodel_settings;
create trigger remodel_setting_audit_trigger
after insert or update on public.remodel_settings
for each row execute function public.remodel_setting_audit();

create or replace function public.remodel_location_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile record;
begin
  if tg_op = 'UPDATE'
     and new.sharing is not distinct from old.sharing
     and new.session_id is not distinct from old.session_id then
    return new;
  end if;

  select p.full_name, p.email into actor_profile
  from public.profiles p
  where p.id = new.profile_id;

  insert into public.remodel_audit_events (
    organization_id, actor_id, actor_name, actor_email, action, entity_kind,
    entity_id, subject, before_data, after_data
  ) values (
    new.organization_id,
    new.profile_id,
    coalesce(actor_profile.full_name, 'System'),
    actor_profile.email,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    'location',
    new.profile_id,
    case when new.sharing then 'Started location sharing' else 'Stopped location sharing' end,
    case when tg_op = 'UPDATE' then jsonb_build_object('sharing', old.sharing) else null end,
    jsonb_build_object('sharing', new.sharing)
  );

  return new;
end;
$$;

revoke all on function public.remodel_location_audit() from public, anon, authenticated;
drop trigger if exists remodel_location_audit_trigger on public.remodel_locations;
create trigger remodel_location_audit_trigger
after insert or update on public.remodel_locations
for each row execute function public.remodel_location_audit();

notify pgrst, 'reload schema';
commit;
