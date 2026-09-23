begin;
alter table public.remodel_records drop constraint if exists remodel_records_kind_check;
alter table public.remodel_records add constraint remodel_records_kind_check check (kind in ('project','task','contractor','scope','comment','attachment','activity'));
alter table public.remodel_records drop constraint if exists remodel_records_check;
alter table public.remodel_records add constraint remodel_records_check check (
  (kind in ('project','contractor') and project_id is null) or
  (kind in ('task','scope','comment','attachment','activity') and project_id is not null)
);

-- The task transition and its activity commit together, even with simultaneous saves.
create or replace function public.remodel_log_work_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event jsonb; event_id uuid; at_time text;
begin
  if new.kind <> 'task' or new.data->>'status' <> 'Done' or new.data->'completion' is null then return new; end if;
  if TG_OP = 'UPDATE' then
    if old.data->>'status' = 'Done' or old.data->'completion'->>'id' = new.data->'completion'->>'id' then return new; end if;
  end if;
  event_id := (new.data->'completion'->>'id')::uuid;
  at_time := new.data->'completion'->>'at';
  event := jsonb_build_object(
    'id', event_id, 'projectId', new.project_id, 'activityType', 'Work completed',
    'actorId', new.data->'completion'->>'byId', 'actorName', new.data->'completion'->>'byName',
    'authorId', new.data->'completion'->>'byId', 'authorName', new.data->'completion'->>'byName',
    'occurredAt', at_time, 'createdAt', at_time, 'updatedAt', at_time,
    'summary', new.data->>'title', 'notes', '', 'amount', null, 'party', '', 'paymentMethod', '',
    'contractorId', coalesce(new.data->>'contractorId',''), 'attachmentIds', '[]'::jsonb, 'sourceTaskId', new.id
  );
  insert into public.remodel_records(id,organization_id,created_by,kind,project_id,data,updated_at)
    values(event_id,new.organization_id,(new.data->'completion'->>'byId')::uuid,'activity',new.project_id,event,at_time)
    on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.remodel_log_work_completed() from public, anon, authenticated;
drop trigger if exists remodel_work_completed on public.remodel_records;
create trigger remodel_work_completed after insert or update on public.remodel_records
  for each row execute function public.remodel_log_work_completed();
notify pgrst, 'reload schema';
commit;
