begin;

create table if not exists public.remodel_sms_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_e164 text not null check (sender_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null check (status in ('allowed', 'do_not_disturb')),
  opted_out_at timestamptz,
  opted_in_at timestamptz,
  last_keyword text not null,
  last_message_sid text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, sender_e164, phone_e164)
);

create table if not exists public.remodel_sms_compliance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_sid text not null,
  sender_e164 text not null check (sender_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  event_type text not null check (event_type in ('stop', 'start', 'help')),
  created_at timestamptz not null default now(),
  unique (organization_id, message_sid)
);

create index if not exists remodel_sms_preferences_dnd
  on public.remodel_sms_preferences (organization_id, status, updated_at desc);
create index if not exists remodel_sms_events_recent
  on public.remodel_sms_compliance_events (organization_id, created_at desc, id desc);

alter table public.remodel_sms_preferences enable row level security;
alter table public.remodel_sms_compliance_events enable row level security;
revoke all on public.remodel_sms_preferences from public, anon, authenticated;
revoke all on public.remodel_sms_compliance_events from public, anon, authenticated;
grant all on public.remodel_sms_preferences to service_role;
grant all on public.remodel_sms_compliance_events to service_role;

create or replace function public.remodel_apply_sms_compliance_event(
  target_organization_id uuid,
  target_sender_e164 text,
  target_phone_e164 text,
  target_event_type text,
  target_message_sid text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if target_event_type not in ('stop', 'start', 'help') then
    raise exception 'Unsupported SMS compliance event';
  end if;

  insert into public.remodel_sms_compliance_events (
    organization_id,
    message_sid,
    sender_e164,
    phone_e164,
    event_type
  ) values (
    target_organization_id,
    target_message_sid,
    target_sender_e164,
    target_phone_e164,
    target_event_type
  )
  on conflict (organization_id, message_sid) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return false;
  end if;

  if target_event_type = 'stop' then
    insert into public.remodel_sms_preferences (
      organization_id,
      sender_e164,
      phone_e164,
      status,
      opted_out_at,
      opted_in_at,
      last_keyword,
      last_message_sid,
      updated_at
    ) values (
      target_organization_id,
      target_sender_e164,
      target_phone_e164,
      'do_not_disturb',
      now(),
      null,
      target_event_type,
      target_message_sid,
      now()
    )
    on conflict (organization_id, sender_e164, phone_e164) do update set
      status = excluded.status,
      opted_out_at = excluded.opted_out_at,
      opted_in_at = null,
      last_keyword = excluded.last_keyword,
      last_message_sid = excluded.last_message_sid,
      updated_at = excluded.updated_at;
  elsif target_event_type = 'start' then
    insert into public.remodel_sms_preferences (
      organization_id,
      sender_e164,
      phone_e164,
      status,
      opted_out_at,
      opted_in_at,
      last_keyword,
      last_message_sid,
      updated_at
    ) values (
      target_organization_id,
      target_sender_e164,
      target_phone_e164,
      'allowed',
      null,
      now(),
      target_event_type,
      target_message_sid,
      now()
    )
    on conflict (organization_id, sender_e164, phone_e164) do update set
      status = excluded.status,
      opted_in_at = excluded.opted_in_at,
      last_keyword = excluded.last_keyword,
      last_message_sid = excluded.last_message_sid,
      updated_at = excluded.updated_at;
  end if;

  return true;
end;
$$;

revoke all on function public.remodel_apply_sms_compliance_event(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.remodel_apply_sms_compliance_event(uuid, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
