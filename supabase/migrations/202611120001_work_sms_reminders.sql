begin;

create table public.remodel_project_sms_reminders (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  reminder_date date not null,
  status text not null check (status in ('claimed', 'sent', 'failed', 'skipped')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  recipient_e164 text,
  message_sid text,
  last_error text,
  primary key (organization_id, project_id, reminder_date),
  foreign key (organization_id, project_id)
    references public.remodel_records(organization_id, id) on delete cascade
);
create index remodel_project_sms_reminders_status
  on public.remodel_project_sms_reminders (status, claimed_at);
create index remodel_records_due_sms_reminder
  on public.remodel_records ((data->>'dueDate'))
  where kind = 'task';

alter table public.remodel_project_sms_reminders enable row level security;
revoke all on public.remodel_project_sms_reminders from public, anon, authenticated;
grant all on public.remodel_project_sms_reminders to service_role;

create function public.remodel_claim_due_project_sms_reminders(batch_size integer default 10)
returns setof public.remodel_project_sms_reminders
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with due as (
    select distinct t.organization_id, p.id as project_id,
      (now() at time zone coalesce(nullif(b.regional->>'timezone', ''), 'America/New_York'))::date as local_date,
      coalesce(nullif(p.data->>'smsScheduleTime', ''), '09:00') as send_time
    from public.remodel_records t
    left join public.remodel_business_config b on b.organization_id = t.organization_id
    join public.remodel_records p on p.organization_id = t.organization_id
      and p.id = t.project_id and p.kind = 'project'
    left join public.remodel_project_sms_reminders r on r.organization_id = t.organization_id
      and r.project_id = p.id and r.reminder_date =
        (now() at time zone coalesce(nullif(b.regional->>'timezone', ''), 'America/New_York'))::date
    where t.kind = 'task'
      and p.data->>'smsScheduleEnabled' = 'true'
      and t.data->>'status' <> 'Done'
      and p.data->>'status' <> 'Completed'
      and coalesce(p.data->>'contactId', '') <> ''
      and t.data->>'dueDate' = to_char(
        now() at time zone coalesce(nullif(b.regional->>'timezone', ''), 'America/New_York'),
        'YYYY-MM-DD'
      )
      and coalesce(nullif(p.data->>'smsScheduleTime', ''), '09:00') <=
        to_char(now() at time zone coalesce(nullif(b.regional->>'timezone', ''), 'America/New_York'), 'HH24:MI')
      and to_char(now() at time zone coalesce(nullif(b.regional->>'timezone', ''), 'America/New_York'), 'HH24:MI') <
        least(coalesce(nullif(t.data->>'startTime', ''), '12:00'), '12:00')
      and (
        r.project_id is null
        or (r.status = 'skipped' and r.claimed_at < now() - interval '5 minutes')
        or (r.status = 'failed' and r.attempts < 3 and r.claimed_at < now() - interval '15 minutes')
        or (r.status = 'claimed' and r.attempts < 3 and r.claimed_at < now() - interval '10 minutes')
      )
    order by send_time, project_id
    limit least(greatest(batch_size, 1), 30)
  )
  insert into public.remodel_project_sms_reminders as r
    (organization_id, project_id, reminder_date, status, attempts, claimed_at)
  select due.organization_id, due.project_id, due.local_date, 'claimed', 1, now() from due
  on conflict (organization_id, project_id, reminder_date) do update set
    status = 'claimed', attempts = r.attempts + 1, claimed_at = now(), last_error = null
  where (r.status = 'skipped' and r.claimed_at < now() - interval '5 minutes')
     or (r.status = 'failed' and r.attempts < 3 and r.claimed_at < now() - interval '15 minutes')
     or (r.status = 'claimed' and r.attempts < 3 and r.claimed_at < now() - interval '10 minutes')
  returning r.*;
end;
$$;
revoke all on function public.remodel_claim_due_project_sms_reminders(integer) from public, anon, authenticated;
grant execute on function public.remodel_claim_due_project_sms_reminders(integer) to service_role;

notify pgrst, 'reload schema';
commit;
