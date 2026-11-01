begin;

create table if not exists public.remodel_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_key text not null check (workflow_key ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  primary_object_type text not null check (primary_object_type in (
    'organization','contact','lead','quote','project','item','communication',
    'appointment','payment','user','event'
  )),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  current_draft_version_id uuid,
  published_version_id uuid,
  draft_revision bigint not null default 0 check (draft_revision >= 0),
  system_controlled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, workflow_key)
);

create table if not exists public.remodel_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.remodel_workflows(id) on delete cascade,
  version_number bigint not null check (version_number >= 1),
  state text not null check (state in ('draft','published','retired')),
  graph jsonb not null check (jsonb_typeof(graph) = 'object'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  change_note text not null default '' check (length(change_note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (workflow_id, version_number)
);

alter table public.remodel_workflows
  add constraint remodel_workflows_draft_version_fk
  foreign key (current_draft_version_id) references public.remodel_workflow_versions(id)
  on delete set null deferrable initially deferred;
alter table public.remodel_workflows
  add constraint remodel_workflows_published_version_fk
  foreign key (published_version_id) references public.remodel_workflow_versions(id)
  on delete set null deferrable initially deferred;

create table if not exists public.remodel_workflow_trigger_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.remodel_workflows(id) on delete cascade,
  version_id uuid not null references public.remodel_workflow_versions(id) on delete cascade,
  node_id text not null check (length(trim(node_id)) between 1 and 120),
  event_type text not null check (length(trim(event_type)) between 3 and 120),
  filter_definition jsonb,
  schedule_definition jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (version_id, node_id)
);

create index if not exists remodel_workflow_subscriptions_event
  on public.remodel_workflow_trigger_subscriptions
  (organization_id, event_type, version_id);
create index if not exists remodel_workflow_subscriptions_due
  on public.remodel_workflow_trigger_subscriptions (next_run_at, id)
  where event_type = 'schedule.reached' and next_run_at is not null;

create table if not exists public.remodel_workflow_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  event_type text not null check (length(trim(event_type)) between 3 and 120),
  actor jsonb not null default '{"type":"system"}'::jsonb check (jsonb_typeof(actor) = 'object'),
  object_type text not null,
  object_id text not null check (length(object_id) between 1 and 160),
  contact_id uuid,
  occurred_at timestamptz not null,
  correlation_id uuid not null,
  causation_id uuid,
  idempotency_key text not null check (length(idempotency_key) between 1 and 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists remodel_workflow_events_object
  on public.remodel_workflow_events
  (organization_id, object_type, object_id, occurred_at desc);

create table if not exists public.remodel_automation_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.remodel_workflow_events(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','claimed','completed','failed','needs_attention')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id)
);

create index if not exists remodel_automation_outbox_due
  on public.remodel_automation_outbox (status, available_at, created_at);

create table if not exists public.remodel_workflow_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.remodel_workflows(id) on delete cascade,
  version_id uuid not null references public.remodel_workflow_versions(id) on delete restrict,
  event_id uuid references public.remodel_workflow_events(id) on delete set null,
  object_type text not null,
  object_id text not null,
  scope_key text not null,
  reentry_key text not null,
  status text not null check (status in ('active','completed','cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists remodel_workflow_enrollment_active
  on public.remodel_workflow_enrollments
  (organization_id, workflow_id, scope_key, status, started_at desc);

create table if not exists public.remodel_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.remodel_workflows(id) on delete cascade,
  version_id uuid not null references public.remodel_workflow_versions(id) on delete restrict,
  enrollment_id uuid references public.remodel_workflow_enrollments(id) on delete set null,
  event_id uuid references public.remodel_workflow_events(id) on delete set null,
  object_type text not null,
  object_id text not null,
  contact_id uuid,
  correlation_id uuid not null,
  status text not null check (status in (
    'queued','running','waiting','completed','needs_attention','cancelled'
  )),
  current_node_id text,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists remodel_workflow_runs_recent
  on public.remodel_workflow_runs
  (organization_id, workflow_id, started_at desc, id desc);
create index if not exists remodel_workflow_runs_object
  on public.remodel_workflow_runs
  (organization_id, object_type, object_id, started_at desc);
create index if not exists remodel_workflow_runs_attention
  on public.remodel_workflow_runs
  (organization_id, status, last_activity_at desc)
  where status = 'needs_attention';
create unique index if not exists remodel_workflow_runs_event_version_unique
  on public.remodel_workflow_runs (event_id, version_id)
  where event_id is not null;

create table if not exists public.remodel_workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.remodel_workflow_runs(id) on delete cascade,
  node_id text not null check (length(trim(node_id)) between 1 and 120),
  node_type text not null check (length(trim(node_type)) between 3 and 120),
  attempt integer not null default 1 check (attempt between 1 and 10000),
  status text not null check (status in (
    'queued','running','matched','planned','created','reused','sent','skipped',
    'waiting','completed','failed','unknown','not_configured','cancelled'
  )),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  output_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(output_snapshot) = 'object'),
  error_code text,
  error_detail text,
  idempotency_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  next_attempt_at timestamptz,
  unique (run_id, node_id, attempt),
  unique (organization_id, idempotency_key)
);

create index if not exists remodel_workflow_step_runs_path
  on public.remodel_workflow_step_runs (run_id, started_at, id);

create table if not exists public.remodel_workflow_waits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.remodel_workflow_runs(id) on delete cascade,
  step_run_id uuid not null references public.remodel_workflow_step_runs(id) on delete cascade,
  node_id text not null,
  mode text not null check (mode in ('duration','timestamp','relative','event','condition','retry')),
  wake_at timestamptz,
  awaited_event_type text,
  condition jsonb,
  timeout_at timestamptz,
  timeout_behavior text,
  continuation jsonb not null default '{}'::jsonb check (jsonb_typeof(continuation) = 'object'),
  status text not null default 'waiting' check (status in (
    'waiting','claimed','resumed','cancelled','timed_out','needs_attention'
  )),
  claimed_at timestamptz,
  claimed_by text,
  created_at timestamptz not null default now(),
  resumed_at timestamptz
);

create index if not exists remodel_workflow_waits_due
  on public.remodel_workflow_waits (status, wake_at, timeout_at)
  where status = 'waiting';
create index if not exists remodel_workflow_waits_event
  on public.remodel_workflow_waits (organization_id, awaited_event_type, status)
  where status = 'waiting';

create table if not exists public.remodel_workflow_effects (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  run_id uuid not null references public.remodel_workflow_runs(id) on delete cascade,
  node_id text not null,
  effect_type text not null,
  status text not null default 'claimed' check (status in ('claimed','completed','failed')),
  provider_id text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);

create table if not exists public.remodel_workflow_object_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  body text not null check (length(trim(body)) between 1 and 20000),
  run_id uuid not null references public.remodel_workflow_runs(id) on delete cascade,
  node_id text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index if not exists remodel_workflow_object_notes_object
  on public.remodel_workflow_object_notes
  (organization_id, object_type, object_id, created_at desc);

create table if not exists public.remodel_workflow_inbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.remodel_workflows(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (organization_id, workflow_id)
);

-- Read access follows the selected organization. Writes are performed by
-- authenticated server routes after membership and role checks.
alter table public.remodel_workflows enable row level security;
alter table public.remodel_workflow_versions enable row level security;
alter table public.remodel_workflow_trigger_subscriptions enable row level security;
alter table public.remodel_workflow_events enable row level security;
alter table public.remodel_automation_outbox enable row level security;
alter table public.remodel_workflow_enrollments enable row level security;
alter table public.remodel_workflow_runs enable row level security;
alter table public.remodel_workflow_step_runs enable row level security;
alter table public.remodel_workflow_waits enable row level security;
alter table public.remodel_workflow_effects enable row level security;
alter table public.remodel_workflow_object_notes enable row level security;
alter table public.remodel_workflow_inbound_webhooks enable row level security;

revoke all on public.remodel_workflows from public, anon, authenticated;
revoke all on public.remodel_workflow_versions from public, anon, authenticated;
revoke all on public.remodel_workflow_trigger_subscriptions from public, anon, authenticated;
revoke all on public.remodel_workflow_events from public, anon, authenticated;
revoke all on public.remodel_automation_outbox from public, anon, authenticated;
revoke all on public.remodel_workflow_enrollments from public, anon, authenticated;
revoke all on public.remodel_workflow_runs from public, anon, authenticated;
revoke all on public.remodel_workflow_step_runs from public, anon, authenticated;
revoke all on public.remodel_workflow_waits from public, anon, authenticated;
revoke all on public.remodel_workflow_effects from public, anon, authenticated;
revoke all on public.remodel_workflow_object_notes from public, anon, authenticated;
revoke all on public.remodel_workflow_inbound_webhooks from public, anon, authenticated;

create policy remodel_workflows_read on public.remodel_workflows
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_versions_read on public.remodel_workflow_versions
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_subscriptions_read on public.remodel_workflow_trigger_subscriptions
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_events_read on public.remodel_workflow_events
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_enrollments_read on public.remodel_workflow_enrollments
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_runs_read on public.remodel_workflow_runs
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_step_runs_read on public.remodel_workflow_step_runs
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_waits_read on public.remodel_workflow_waits
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_effects_read on public.remodel_workflow_effects
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
create policy remodel_workflow_object_notes_read on public.remodel_workflow_object_notes
  for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));

grant select on public.remodel_workflows to authenticated;
grant select on public.remodel_workflow_versions to authenticated;
grant select on public.remodel_workflow_trigger_subscriptions to authenticated;
grant select on public.remodel_workflow_events to authenticated;
grant select on public.remodel_workflow_enrollments to authenticated;
grant select on public.remodel_workflow_runs to authenticated;
grant select on public.remodel_workflow_step_runs to authenticated;
grant select on public.remodel_workflow_waits to authenticated;
grant select on public.remodel_workflow_effects to authenticated;
grant select on public.remodel_workflow_object_notes to authenticated;

grant all on public.remodel_workflows to service_role;
grant all on public.remodel_workflow_versions to service_role;
grant all on public.remodel_workflow_trigger_subscriptions to service_role;
grant all on public.remodel_workflow_events to service_role;
grant all on public.remodel_automation_outbox to service_role;
grant all on public.remodel_workflow_enrollments to service_role;
grant all on public.remodel_workflow_runs to service_role;
grant all on public.remodel_workflow_step_runs to service_role;
grant all on public.remodel_workflow_waits to service_role;
grant all on public.remodel_workflow_effects to service_role;
grant all on public.remodel_workflow_object_notes to service_role;
grant all on public.remodel_workflow_inbound_webhooks to service_role;

-- Domain routes use this RPC so the immutable event and its outbox job are
-- committed together. Replaying the same provider/submission id returns the
-- original event instead of scheduling duplicate workflow effects.
create or replace function public.remodel_enqueue_workflow_event(
  p_event_id uuid,
  p_organization_id uuid,
  p_schema_version integer,
  p_event_type text,
  p_actor jsonb,
  p_object_type text,
  p_object_id text,
  p_contact_id uuid,
  p_occurred_at timestamptz,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_idempotency_key text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_created boolean := false;
begin
  if p_schema_version < 1
     or length(trim(p_event_type)) not between 3 and 120
     or length(p_object_id) not between 1 and 160
     or length(trim(p_idempotency_key)) not between 1 and 240
     or jsonb_typeof(p_actor) <> 'object'
     or jsonb_typeof(p_payload) <> 'object'
  then raise exception 'Invalid workflow event'; end if;

  insert into public.remodel_workflow_events (
    id, organization_id, schema_version, event_type, actor, object_type,
    object_id, contact_id, occurred_at, correlation_id, causation_id,
    idempotency_key, payload
  ) values (
    p_event_id, p_organization_id, p_schema_version, p_event_type, p_actor,
    p_object_type, p_object_id, p_contact_id, p_occurred_at,
    p_correlation_id, p_causation_id, p_idempotency_key, p_payload
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    v_created := true;
  else
    select id into v_event_id
    from public.remodel_workflow_events
    where organization_id = p_organization_id
      and idempotency_key = p_idempotency_key;
  end if;

  insert into public.remodel_automation_outbox (
    organization_id, event_id, status, available_at
  ) values (p_organization_id, v_event_id, 'pending', now())
  on conflict (event_id) do nothing;

  return jsonb_build_object('eventId', v_event_id, 'created', v_created);
end;
$$;

revoke all on function public.remodel_enqueue_workflow_event(
  uuid,uuid,integer,text,jsonb,text,text,uuid,timestamptz,uuid,uuid,text,jsonb
) from public, anon, authenticated;
grant execute on function public.remodel_enqueue_workflow_event(
  uuid,uuid,integer,text,jsonb,text,text,uuid,timestamptz,uuid,uuid,text,jsonb
) to service_role;

-- Live cutover keeps website Contact + Lead creation and the workflow event in
-- one transaction. The generic workflow then reuses those records and owns all
-- configurable follow-up effects. The legacy capture RPC remains unchanged for
-- shadow rollback and existing clients.
create or replace function public.remodel_capture_workflow_website_lead(
  p_organization_id uuid,
  p_contact jsonb,
  p_lead jsonb,
  p_match_existing boolean,
  p_event jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capture record;
  v_event jsonb;
begin
  if jsonb_typeof(p_event) <> 'object'
     or p_event->>'type' <> 'website.form.submitted'
     or p_event->>'objectType' <> 'lead'
     or p_event->>'objectId' is distinct from p_lead->>'id'
  then raise exception 'Invalid website workflow event'; end if;

  select * into v_capture
  from public.remodel_capture_website_lead(
    p_organization_id,
    p_contact,
    p_lead,
    p_match_existing,
    '[
      {"key":"contact","label":"Contact","status":"created"},
      {"key":"lead","label":"Lead","status":"created"}
    ]'::jsonb
  );

  -- New live executions are represented by the generic run tables only.
  delete from public.remodel_automation_runs where id = v_capture.run_id;

  select public.remodel_enqueue_workflow_event(
    (p_event->>'id')::uuid,
    p_organization_id,
    coalesce((p_event->>'schemaVersion')::integer, 1),
    p_event->>'type',
    coalesce(p_event->'actor', '{"type":"system"}'::jsonb),
    p_event->>'objectType',
    p_event->>'objectId',
    v_capture.contact_id,
    (p_event->>'occurredAt')::timestamptz,
    (p_event->>'correlationId')::uuid,
    nullif(p_event->>'causationId', '')::uuid,
    p_event->>'idempotencyKey',
    coalesce(p_event->'payload', '{}'::jsonb) || jsonb_build_object(
      'contactReused', v_capture.contact_reused
    )
  ) into v_event;

  if not v_capture.contact_reused then
    perform public.remodel_enqueue_workflow_event(
      gen_random_uuid(), p_organization_id, 1, 'contact.created',
      coalesce(p_event->'actor', '{"type":"system"}'::jsonb),
      'contact', v_capture.contact_id::text, v_capture.contact_id,
      (p_event->>'occurredAt')::timestamptz,
      (p_event->>'correlationId')::uuid,
      (p_event->>'id')::uuid,
      'contact-created:website:' || v_capture.lead_id::text,
      jsonb_build_object('recordId', v_capture.contact_id)
    );
  end if;
  perform public.remodel_enqueue_workflow_event(
    gen_random_uuid(), p_organization_id, 1, 'lead.created',
    coalesce(p_event->'actor', '{"type":"system"}'::jsonb),
    'lead', v_capture.lead_id::text, v_capture.contact_id,
    (p_event->>'occurredAt')::timestamptz,
    (p_event->>'correlationId')::uuid,
    (p_event->>'id')::uuid,
    'lead-created:website:' || v_capture.lead_id::text,
    jsonb_build_object(
      'recordId', v_capture.lead_id,
      'contactId', v_capture.contact_id
    )
  );

  return jsonb_build_object(
    'contactId', v_capture.contact_id,
    'leadId', v_capture.lead_id,
    'contactReused', v_capture.contact_reused,
    'eventId', v_event->>'eventId',
    'eventCreated', coalesce((v_event->>'created')::boolean, false)
  );
end;
$$;

revoke all on function public.remodel_capture_workflow_website_lead(uuid,jsonb,jsonb,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.remodel_capture_workflow_website_lead(uuid,jsonb,jsonb,boolean,jsonb)
  to service_role;

create or replace function public.remodel_workflow_find_or_create_contact(
  p_organization_id uuid,
  p_contact jsonb,
  p_match_existing boolean,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_email text := lower(trim(coalesce(p_contact->>'email', '')));
  v_phone text := trim(coalesce(p_contact->>'phone', ''));
  v_lock text;
  v_data jsonb;
  v_reused boolean := false;
begin
  if jsonb_typeof(p_contact) <> 'object'
     or not exists (select 1 from public.organizations where id = p_organization_id)
  then raise exception 'Invalid Contact'; end if;

  if p_match_existing then
    for v_lock in
      select key from (
        select p_organization_id::text || ':email:' || v_email as key where v_email <> ''
        union
        select p_organization_id::text || ':phone:' || v_phone as key where v_phone <> ''
      ) keys order by key
    loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock, 0));
    end loop;
    if v_email <> '' then
      select id, data into v_contact_id, v_data
      from public.remodel_records
      where organization_id = p_organization_id and kind = 'contact'
        and lower(data->>'email') = v_email
      order by updated_at desc, id desc limit 1;
    end if;
    if v_contact_id is null and v_phone <> '' then
      select id, data into v_contact_id, v_data
      from public.remodel_records
      where organization_id = p_organization_id and kind = 'contact'
        and data->>'phone' = v_phone
      order by updated_at desc, id desc limit 1;
    end if;
    v_reused := v_contact_id is not null;
  end if;

  if v_contact_id is null then
    v_contact_id := coalesce((p_contact->>'id')::uuid, gen_random_uuid());
    v_data := p_contact || jsonb_build_object(
      'id', v_contact_id,
      'createdAt', coalesce(p_contact->>'createdAt', now()::text),
      'updatedAt', coalesce(p_contact->>'updatedAt', now()::text)
    );
    insert into public.remodel_records (
      id, organization_id, kind, project_id, data, created_by, updated_by, updated_at
    ) values (
      v_contact_id, p_organization_id, 'contact', null, v_data,
      p_created_by, p_created_by, (v_data->>'updatedAt')::timestamptz
    );
  end if;

  return jsonb_build_object(
    'contact', v_data,
    'created', not v_reused,
    'reused', v_reused
  );
end;
$$;

revoke all on function public.remodel_workflow_find_or_create_contact(uuid,jsonb,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.remodel_workflow_find_or_create_contact(uuid,jsonb,boolean,uuid)
  to service_role;

create or replace function public.remodel_claim_workflow_effect(
  p_organization_id uuid,
  p_idempotency_key text,
  p_run_id uuid,
  p_node_id text,
  p_effect_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect public.remodel_workflow_effects%rowtype;
  v_inserted boolean := false;
begin
  insert into public.remodel_workflow_effects (
    organization_id, idempotency_key, run_id, node_id, effect_type, status
  ) values (
    p_organization_id, p_idempotency_key, p_run_id, p_node_id, p_effect_type, 'claimed'
  ) on conflict (organization_id, idempotency_key) do nothing
  returning true into v_inserted;

  select * into v_effect
  from public.remodel_workflow_effects
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key
  for update;

  if v_inserted then
    return jsonb_build_object('claimed', true, 'status', 'claimed');
  end if;

  if v_effect.status = 'completed' then
    return jsonb_build_object(
      'claimed', false,
      'status', v_effect.status,
      'result', v_effect.result,
      'providerId', v_effect.provider_id
    );
  end if;
  if v_effect.status = 'claimed' and v_effect.claimed_at < now() - interval '10 minutes' then
    update public.remodel_workflow_effects
    set claimed_at = now(), run_id = p_run_id, node_id = p_node_id,
        effect_type = p_effect_type, last_error = null
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('claimed', true, 'status', 'claimed');
  end if;
  if v_effect.status = 'failed' then
    update public.remodel_workflow_effects
    set status = 'claimed', claimed_at = now(), run_id = p_run_id,
        node_id = p_node_id, effect_type = p_effect_type, last_error = null
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('claimed', true, 'status', 'claimed');
  end if;
  return jsonb_build_object('claimed', false, 'status', v_effect.status);
end;
$$;

revoke all on function public.remodel_claim_workflow_effect(uuid,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.remodel_claim_workflow_effect(uuid,text,uuid,text,text)
  to service_role;

create or replace function public.remodel_create_workflow(
  p_organization_id uuid,
  p_actor_id uuid,
  p_workflow_key text,
  p_name text,
  p_description text,
  p_primary_object_type text,
  p_graph jsonb,
  p_settings jsonb,
  p_layout jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_id uuid;
  v_version_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and organization_id = p_organization_id
      and active = true and role::text in ('owner','admin')
  ) then raise exception 'Only an active administrator can create workflows';
  end if;
  if p_workflow_key !~ '^[a-z0-9][a-z0-9-]{0,99}$'
     or jsonb_typeof(p_graph) <> 'object'
     or jsonb_typeof(p_settings) <> 'object'
     or jsonb_typeof(p_layout) <> 'object'
  then raise exception 'Invalid workflow definition'; end if;

  insert into public.remodel_workflows (
    organization_id, workflow_key, name, description, primary_object_type,
    status, draft_revision, created_by, updated_by
  ) values (
    p_organization_id, p_workflow_key, p_name, coalesce(p_description, ''),
    p_primary_object_type, 'draft', 1, p_actor_id, p_actor_id
  ) returning id into v_workflow_id;

  insert into public.remodel_workflow_versions (
    organization_id, workflow_id, version_number, state, graph, settings,
    layout, change_note, created_by
  ) values (
    p_organization_id, v_workflow_id, 1, 'draft', p_graph, p_settings,
    p_layout, 'Initial draft', p_actor_id
  ) returning id into v_version_id;

  update public.remodel_workflows
  set current_draft_version_id = v_version_id
  where id = v_workflow_id;

  return jsonb_build_object(
    'workflowId', v_workflow_id,
    'draftVersionId', v_version_id,
    'revision', 1
  );
end;
$$;

create or replace function public.remodel_save_workflow_draft(
  p_organization_id uuid,
  p_actor_id uuid,
  p_workflow_id uuid,
  p_expected_revision bigint,
  p_graph jsonb,
  p_settings jsonb,
  p_layout jsonb,
  p_name text,
  p_description text,
  p_change_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
  v_system_controlled boolean;
  v_old_draft uuid;
  v_version_number bigint;
  v_version_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and organization_id = p_organization_id
      and active = true and role::text in ('owner','admin')
  ) then raise exception 'Only an active administrator can edit workflows';
  end if;
  if jsonb_typeof(p_graph) <> 'object'
     or jsonb_typeof(p_settings) <> 'object'
     or jsonb_typeof(p_layout) <> 'object'
  then raise exception 'Invalid workflow definition'; end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'remodel-workflow:' || p_organization_id::text || ':' || p_workflow_id::text, 0));
  select draft_revision, system_controlled, current_draft_version_id
  into v_revision, v_system_controlled, v_old_draft
  from public.remodel_workflows
  where id = p_workflow_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Workflow not found'; end if;
  if v_system_controlled then raise exception 'System workflows cannot be edited'; end if;
  if v_revision <> p_expected_revision then
    return jsonb_build_object('result','conflict','revision',v_revision);
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version_number
  from public.remodel_workflow_versions where workflow_id = p_workflow_id;
  insert into public.remodel_workflow_versions (
    organization_id, workflow_id, version_number, state, graph, settings,
    layout, change_note, created_by
  ) values (
    p_organization_id, p_workflow_id, v_version_number, 'draft', p_graph,
    p_settings, p_layout, left(coalesce(p_change_note,''),500), p_actor_id
  ) returning id into v_version_id;

  update public.remodel_workflow_versions set state = 'retired'
  where id = v_old_draft and state = 'draft';
  update public.remodel_workflows
  set current_draft_version_id = v_version_id,
      draft_revision = draft_revision + 1,
      name = coalesce(nullif(trim(p_name), ''), name),
      description = coalesce(p_description, description),
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_workflow_id;

  return jsonb_build_object(
    'result','saved','revision',v_revision + 1,
    'versionId',v_version_id,'versionNumber',v_version_number
  );
end;
$$;

create or replace function public.remodel_publish_workflow(
  p_organization_id uuid,
  p_actor_id uuid,
  p_workflow_id uuid,
  p_expected_revision bigint,
  p_change_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
  v_system_controlled boolean;
  v_draft public.remodel_workflow_versions%rowtype;
  v_old_published uuid;
  v_next_version_number bigint;
  v_next_draft_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and organization_id = p_organization_id
      and active = true and role::text in ('owner','admin')
  ) then raise exception 'Only an active administrator can publish workflows';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'remodel-workflow:' || p_organization_id::text || ':' || p_workflow_id::text, 0));
  select draft_revision, system_controlled, published_version_id
  into v_revision, v_system_controlled, v_old_published
  from public.remodel_workflows
  where id = p_workflow_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Workflow not found'; end if;
  if v_system_controlled then raise exception 'System workflows cannot be published manually'; end if;
  if v_revision <> p_expected_revision then
    return jsonb_build_object('result','conflict','revision',v_revision);
  end if;

  select version.* into v_draft
  from public.remodel_workflow_versions as version
  join public.remodel_workflows as workflow
    on workflow.current_draft_version_id = version.id
  where workflow.id = p_workflow_id and workflow.organization_id = p_organization_id
    and version.state = 'draft'
  for update of version;
  if v_draft.id is null then raise exception 'Workflow draft not found'; end if;

  update public.remodel_workflow_versions set state = 'retired'
  where id = v_old_published and state = 'published';
  update public.remodel_workflow_versions
  set state = 'published', published_at = now(),
      change_note = case when trim(coalesce(p_change_note,'')) = ''
        then change_note else left(p_change_note,500) end
  where id = v_draft.id;

  delete from public.remodel_workflow_trigger_subscriptions
  where workflow_id = p_workflow_id;
  insert into public.remodel_workflow_trigger_subscriptions (
    organization_id, workflow_id, version_id, node_id, event_type,
    filter_definition, schedule_definition, next_run_at
  )
  select p_organization_id, p_workflow_id, v_draft.id,
    node->>'id', node->'config'->>'eventType', node->'config'->'filters',
    node->'config'->'schedule',
    case when node->'config'->>'eventType' = 'schedule.reached' then
      coalesce(
        nullif(node->'config'->'schedule'->>'at', '')::timestamptz,
        nullif(node->'config'->'schedule'->>'startAt', '')::timestamptz,
        now()
      )
    else null end
  from jsonb_array_elements(v_draft.graph->'nodes') as node
  where node->>'kind' = 'trigger' and node->'config'->>'eventType' is not null;

  select coalesce(max(version_number),0) + 1 into v_next_version_number
  from public.remodel_workflow_versions where workflow_id = p_workflow_id;
  insert into public.remodel_workflow_versions (
    organization_id, workflow_id, version_number, state, graph, settings,
    layout, change_note, created_by
  ) values (
    p_organization_id, p_workflow_id, v_next_version_number, 'draft',
    v_draft.graph, v_draft.settings, v_draft.layout,
    'Draft from published version ' || v_draft.version_number::text, p_actor_id
  ) returning id into v_next_draft_id;

  update public.remodel_workflows
  set status = 'published',
      published_version_id = v_draft.id,
      current_draft_version_id = v_next_draft_id,
      draft_revision = draft_revision + 1,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_workflow_id;

  return jsonb_build_object(
    'result','published','revision',v_revision + 1,
    'publishedVersionId',v_draft.id,
    'publishedVersionNumber',v_draft.version_number,
    'draftVersionId',v_next_draft_id,
    'draftVersionNumber',v_next_version_number
  );
end;
$$;

revoke all on function public.remodel_create_workflow(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.remodel_save_workflow_draft(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text,text)
  from public, anon, authenticated;
revoke all on function public.remodel_publish_workflow(uuid,uuid,uuid,bigint,text)
  from public, anon, authenticated;
grant execute on function public.remodel_create_workflow(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb)
  to service_role;
grant execute on function public.remodel_save_workflow_draft(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,text,text,text)
  to service_role;
grant execute on function public.remodel_publish_workflow(uuid,uuid,uuid,bigint,text)
  to service_role;

create or replace function public.remodel_claim_workflow_outbox(
  p_worker text,
  p_limit integer default 20
) returns setof public.remodel_automation_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.remodel_automation_outbox
    where status in ('pending','failed') and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.remodel_automation_outbox as outbox
  set status = 'claimed',
      claimed_at = now(),
      claimed_by = left(p_worker, 160),
      attempt_count = attempt_count + 1
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.remodel_claim_due_workflow_waits(
  p_worker text,
  p_limit integer default 20
) returns setof public.remodel_workflow_waits
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.remodel_workflow_waits
    where status = 'waiting'
      and (wake_at <= now() or timeout_at <= now())
    order by least(coalesce(wake_at, 'infinity'), coalesce(timeout_at, 'infinity'))
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.remodel_workflow_waits as wait
  set status = 'claimed', claimed_at = now(), claimed_by = left(p_worker, 160)
  from candidates
  where wait.id = candidates.id
  returning wait.*;
end;
$$;

create or replace function public.remodel_claim_event_workflow_waits(
  p_worker text,
  p_organization_id uuid,
  p_event_type text,
  p_object_type text,
  p_object_id text,
  p_contact_id uuid default null,
  p_limit integer default 100
) returns setof public.remodel_workflow_waits
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select wait.id
    from public.remodel_workflow_waits as wait
    join public.remodel_workflow_runs as run on run.id = wait.run_id
    where wait.organization_id = p_organization_id
      and wait.status = 'waiting'
      and wait.awaited_event_type = p_event_type
      and (
        (run.object_type = p_object_type and run.object_id = p_object_id)
        or (p_contact_id is not null and run.contact_id = p_contact_id)
      )
    order by wait.created_at, wait.id
    for update of wait skip locked
    limit greatest(1, least(p_limit, 500))
  )
  update public.remodel_workflow_waits as wait
  set status = 'claimed', claimed_at = now(), claimed_by = left(p_worker, 160)
  from candidates
  where wait.id = candidates.id
  returning wait.*;
end;
$$;

create or replace function public.remodel_enqueue_due_workflow_schedules(
  p_limit integer default 50
) returns table(event_id uuid, subscription_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.remodel_workflow_trigger_subscriptions%rowtype;
  v_event_id uuid;
  v_result jsonb;
  v_amount integer;
  v_seconds bigint;
begin
  for v_schedule in
    select subscription.*
    from public.remodel_workflow_trigger_subscriptions as subscription
    where subscription.event_type = 'schedule.reached'
      and subscription.next_run_at is not null
      and subscription.next_run_at <= now()
    order by subscription.next_run_at, subscription.id
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  loop
    v_event_id := gen_random_uuid();
    select public.remodel_enqueue_workflow_event(
      v_event_id,
      v_schedule.organization_id,
      1,
      'schedule.reached',
      '{"type":"system","name":"Workflow scheduler"}'::jsonb,
      'event',
      v_schedule.id::text,
      null,
      v_schedule.next_run_at,
      gen_random_uuid(),
      null,
      'schedule:' || v_schedule.id::text || ':' || v_schedule.next_run_at::text,
      jsonb_build_object(
        'targetWorkflowId', v_schedule.workflow_id,
        'versionId', v_schedule.version_id,
        'triggerNodeId', v_schedule.node_id,
        'scheduledFor', v_schedule.next_run_at
      )
    ) into v_result;

    if v_schedule.schedule_definition->>'mode' = 'interval' then
      v_amount := greatest(
        1,
        least(coalesce((v_schedule.schedule_definition->>'amount')::integer, 1), 525600)
      );
      v_seconds := v_amount * case v_schedule.schedule_definition->>'unit'
        when 'minutes' then 60
        when 'hours' then 3600
        else 86400
      end;
      update public.remodel_workflow_trigger_subscriptions
      set last_run_at = v_schedule.next_run_at,
          next_run_at = greatest(v_schedule.next_run_at, now())
            + make_interval(secs => v_seconds::double precision)
      where id = v_schedule.id;
    else
      update public.remodel_workflow_trigger_subscriptions
      set last_run_at = v_schedule.next_run_at,
          next_run_at = null
      where id = v_schedule.id;
    end if;

    event_id := (v_result->>'eventId')::uuid;
    subscription_id := v_schedule.id;
    return next;
  end loop;
end;
$$;

revoke all on function public.remodel_claim_workflow_outbox(text, integer)
  from public, anon, authenticated;
revoke all on function public.remodel_claim_due_workflow_waits(text, integer)
  from public, anon, authenticated;
revoke all on function public.remodel_claim_event_workflow_waits(text, uuid, text, text, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.remodel_enqueue_due_workflow_schedules(integer)
  from public, anon, authenticated;
grant execute on function public.remodel_claim_workflow_outbox(text, integer)
  to service_role;
grant execute on function public.remodel_claim_due_workflow_waits(text, integer)
  to service_role;
grant execute on function public.remodel_claim_event_workflow_waits(text, uuid, text, text, text, uuid, integer)
  to service_role;
grant execute on function public.remodel_enqueue_due_workflow_schedules(integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
