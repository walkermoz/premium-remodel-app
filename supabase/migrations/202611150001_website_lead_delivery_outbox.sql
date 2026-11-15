begin;

-- Only the server can read customer details or claim a delivery. The lead,
-- workflow event and GoHighLevel job commit together before intake responds.
create table if not exists public.remodel_website_lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  event_id uuid not null references public.remodel_workflow_events(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry_wait', 'delivered', 'needs_attention')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id),
  foreign key (organization_id, lead_id)
    references public.remodel_records(organization_id, id) on delete cascade
);
create index if not exists remodel_website_lead_deliveries_due
  on public.remodel_website_lead_deliveries(status, available_at);
alter table public.remodel_website_lead_deliveries enable row level security;
revoke all on public.remodel_website_lead_deliveries from public, anon, authenticated;
grant all on public.remodel_website_lead_deliveries to service_role;

create or replace function public.remodel_capture_website_lead_with_delivery(
  p_organization_id uuid,
  p_contact jsonb,
  p_lead jsonb,
  p_match_existing boolean,
  p_event jsonb,
  p_delivery_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_capture jsonb;
  v_delivery_id uuid;
begin
  if jsonb_typeof(p_delivery_payload) is distinct from 'object'
     or jsonb_typeof(p_delivery_payload->'sms_appointment_opt_in') is distinct from 'boolean'
     or jsonb_typeof(p_delivery_payload->'sms_marketing_opt_in') is distinct from 'boolean'
     or p_delivery_payload ? 'lead_attribution'
     or p_delivery_payload ? 'submission_id'
  then raise exception 'Invalid website delivery payload'; end if;

  v_capture := public.remodel_capture_workflow_website_lead(
    p_organization_id, p_contact, p_lead, p_match_existing, p_event
  );
  insert into public.remodel_website_lead_deliveries
    (organization_id, lead_id, event_id, payload)
  values (p_organization_id, (p_lead->>'id')::uuid,
          (v_capture->>'eventId')::uuid, p_delivery_payload)
  returning id into v_delivery_id;
  return v_capture || jsonb_build_object('deliveryId', v_delivery_id, 'goHighLevelQueued', true);
end;
$$;

create or replace function public.remodel_claim_website_lead_deliveries(
  p_delivery_id uuid default null, p_limit integer default 10
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_stale integer;
  v_jobs jsonb;
begin
  -- A crashed/timed-out sender may already have reached GoHighLevel. Do not
  -- resend an uncertain delivery automatically: the recipient has no documented
  -- exactly-once guarantee for its inbound workflow webhook.
  update public.remodel_website_lead_deliveries
  set status = 'needs_attention', claim_token = null,
      last_error = 'Delivery outcome unknown after sender interruption; review before resending.'
  where status = 'processing' and claimed_at < now() - interval '2 minutes';
  get diagnostics v_stale = row_count;

  with due as (
    select id from public.remodel_website_lead_deliveries
    where status in ('pending', 'retry_wait') and available_at <= now()
      and attempt_count < 3 and (p_delivery_id is null or id = p_delivery_id)
    order by available_at, created_at, id
    for update skip locked limit greatest(1, least(p_limit, 10))
  ), claimed as (
    update public.remodel_website_lead_deliveries d
    set status = 'processing', attempt_count = d.attempt_count + 1,
        claim_token = gen_random_uuid(), claimed_at = now()
    from due where d.id = due.id returning d.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into v_jobs from claimed;
  return jsonb_build_object('jobs', v_jobs, 'needsAttention', v_stale);
end;
$$;

create or replace function public.remodel_finish_website_lead_delivery(
  p_id uuid, p_claim_token uuid, p_status text,
  p_error text default null, p_available_at timestamptz default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_changed integer;
begin
  if p_status not in ('delivered', 'retry_wait', 'needs_attention')
     or (p_status = 'retry_wait' and p_available_at is null)
  then raise exception 'Invalid website delivery outcome'; end if;
  update public.remodel_website_lead_deliveries
  set status = p_status, last_error = left(p_error, 1000), claim_token = null,
      available_at = coalesce(p_available_at, available_at),
      completed_at = case when p_status = 'delivered' then now() else null end,
      payload = case when p_status = 'delivered' then '{}'::jsonb else payload end
  where id = p_id and status = 'processing' and claim_token = p_claim_token;
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

revoke all on function public.remodel_capture_website_lead_with_delivery(uuid,jsonb,jsonb,boolean,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.remodel_claim_website_lead_deliveries(uuid,integer) from public, anon, authenticated;
revoke all on function public.remodel_finish_website_lead_delivery(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.remodel_capture_website_lead_with_delivery(uuid,jsonb,jsonb,boolean,jsonb,jsonb) to service_role;
grant execute on function public.remodel_claim_website_lead_deliveries(uuid,integer) to service_role;
grant execute on function public.remodel_finish_website_lead_delivery(uuid,uuid,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
