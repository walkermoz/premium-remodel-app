begin;

alter table public.remodel_automation_runs
  add column if not exists last_activity_at timestamptz not null default now();

update public.remodel_automation_runs
set last_activity_at = coalesce(completed_at, started_at);

create or replace function public.remodel_touch_automation_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.last_activity_at := now();
  return new;
end;
$$;

create trigger remodel_automation_run_activity
before update of status, steps on public.remodel_automation_runs
for each row execute function public.remodel_touch_automation_run();

create or replace function public.remodel_reconcile_stale_automation_runs(
  p_organization_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.remodel_automation_runs as run
  set status = 'needs_attention',
      completed_at = now(),
      steps = (
        select coalesce(jsonb_agg(
          case when step.value->>'status' in ('pending', 'retrying')
            then (step.value - 'detail') || jsonb_build_object(
              'status', 'unknown',
              'detail', 'The run was interrupted; delivery could not be confirmed.'
            )
            else step.value end
          order by step.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(run.steps) with ordinality
          as step(value, ordinality)
      ) || case
        when exists (
          select 1 from jsonb_array_elements(run.steps) as step(value)
          where step.value->>'key' = 'record'
        ) then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'key', 'record',
          'label', 'Run completion',
          'status', 'unknown',
          'detail', 'This run stopped before its outcome was recorded.'
        )) end
  where run.organization_id = p_organization_id
    and run.automation_key = 'website-lead-intake'
    and run.status = 'running'
    and run.last_activity_at < now() - interval '5 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.remodel_reconcile_stale_automation_runs(uuid)
  from public, anon, authenticated;
grant execute on function public.remodel_reconcile_stale_automation_runs(uuid)
  to service_role;

commit;
