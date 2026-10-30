begin;

-- Claiming a retry inside a row lock prevents two staff members from sending
-- the same failed notification at the same time. Unknown deliveries are never
-- retried because the provider may already have accepted them.
create or replace function public.remodel_claim_automation_retry(
  p_organization_id uuid,
  p_run_id uuid,
  p_step_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steps jsonb;
  v_index integer;
begin
  if p_step_key not in ('email', 'team') then return false; end if;

  select steps into v_steps
  from public.remodel_automation_runs
  where id = p_run_id
    and organization_id = p_organization_id
    and automation_key = 'website-lead-intake'
  for update;
  if not found then return false; end if;

  select (ordinality - 1)::integer into v_index
  from jsonb_array_elements(v_steps) with ordinality as step(value, ordinality)
  where step.value->>'key' = p_step_key
  limit 1;
  if v_index is null or (v_steps->v_index->>'status') not in ('failed', 'not_configured') then
    return false;
  end if;

  update public.remodel_automation_runs
  set steps = jsonb_set(
        v_steps,
        array[v_index::text],
        ((v_steps->v_index) - 'detail') || jsonb_build_object(
          'status', 'retrying',
          'attempts', coalesce((v_steps->v_index->>'attempts')::integer, 1) + 1
        )
      ),
      status = 'running',
      completed_at = null
  where id = p_run_id;
  return true;
end;
$$;

create or replace function public.remodel_finish_automation_retry(
  p_organization_id uuid,
  p_run_id uuid,
  p_step_key text,
  p_result jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steps jsonb;
  v_next_steps jsonb;
  v_index integer;
  v_lead_id uuid;
  v_now timestamptz := now();
  v_field text;
  v_status text;
begin
  if p_step_key not in ('email', 'team') or jsonb_typeof(p_result) <> 'object' then
    return false;
  end if;
  v_status := p_result->>'status';
  if v_status not in ('sent', 'failed', 'unknown', 'not_configured') then
    return false;
  end if;

  select steps, lead_id into v_steps, v_lead_id
  from public.remodel_automation_runs
  where id = p_run_id
    and organization_id = p_organization_id
    and automation_key = 'website-lead-intake'
  for update;
  if not found then return false; end if;

  select (ordinality - 1)::integer into v_index
  from jsonb_array_elements(v_steps) with ordinality as step(value, ordinality)
  where step.value->>'key' = p_step_key
  limit 1;
  if v_index is null or v_steps->v_index->>'status' <> 'retrying' then
    return false;
  end if;

  v_next_steps := jsonb_set(
    v_steps,
    array[v_index::text],
    ((v_steps->v_index) - 'detail') || jsonb_build_object(
      'status', v_status,
      'attemptedAt', p_result->>'attemptedAt'
    ) || case when p_result ? 'detail'
         then jsonb_build_object('detail', p_result->>'detail')
         else '{}'::jsonb end
  );

  -- Patch the current lead JSON inside this transaction, preserving any edits
  -- made to the lead while the provider request was in flight.
  v_field := case p_step_key when 'email' then 'emailAcknowledgement'
                              else 'discordNotification' end;
  update public.remodel_records
  set data = jsonb_set(
        jsonb_set(data, array[v_field], p_result, true),
        '{updatedAt}', to_jsonb(v_now), true
      ),
      updated_at = v_now
  where id = v_lead_id
    and organization_id = p_organization_id
    and kind = 'lead';

  update public.remodel_automation_runs
  set steps = v_next_steps,
      status = case
        when exists (
          select 1 from jsonb_array_elements(v_next_steps) as step(value)
          where step.value->>'status' = 'retrying'
        ) then 'running'
        when exists (
          select 1 from jsonb_array_elements(v_next_steps) as step(value)
          where step.value->>'status' in ('failed', 'unknown', 'not_configured')
        ) then 'needs_attention'
        else 'completed'
      end,
      completed_at = case
        when exists (
          select 1 from jsonb_array_elements(v_next_steps) as step(value)
          where step.value->>'status' = 'retrying'
        ) then null else v_now end
  where id = p_run_id;
  return true;
end;
$$;

revoke all on function public.remodel_claim_automation_retry(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.remodel_finish_automation_retry(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.remodel_claim_automation_retry(uuid, uuid, text)
  to service_role;
grant execute on function public.remodel_finish_automation_retry(uuid, uuid, text, jsonb)
  to service_role;

commit;
