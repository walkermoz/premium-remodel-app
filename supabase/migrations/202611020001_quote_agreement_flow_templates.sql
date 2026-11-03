begin;

-- A flow template controls the entire journey around a quote. Draft state is
-- editable; every publish creates an immutable definition used by new runtime
-- instances. Existing quotes therefore never change when an administrator
-- edits or republishes a template.
create table if not exists public.remodel_quote_flow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text,
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  revision integer not null default 0 check (revision >= 0),
  current_version integer not null default 0 check (current_version >= 0),
  published_version integer check (published_version is null or published_version > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  is_default boolean not null default false,
  locked boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, template_key)
);

create unique index if not exists remodel_quote_flow_one_default
  on public.remodel_quote_flow_templates (organization_id)
  where is_default = true and status <> 'archived';

create index if not exists remodel_quote_flow_templates_org_status
  on public.remodel_quote_flow_templates (organization_id, status, updated_at desc);

create table if not exists public.remodel_quote_flow_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  version integer not null check (version > 0),
  name text not null,
  description text not null default '',
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  change_note text not null default '' check (length(change_note) <= 500),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (organization_id, template_id, version),
  foreign key (organization_id, template_id)
    references public.remodel_quote_flow_templates(organization_id, id)
    on delete cascade
);

create index if not exists remodel_quote_flow_versions_template
  on public.remodel_quote_flow_template_versions
  (organization_id, template_id, version desc);

create or replace function public.remodel_publish_quote_flow_template(
  p_organization_id uuid,
  p_template_id uuid,
  p_expected_revision integer,
  p_published_by uuid,
  p_change_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  template_row public.remodel_quote_flow_templates%rowtype;
  next_version integer;
begin
  select * into template_row
  from public.remodel_quote_flow_templates
  where organization_id = p_organization_id and id = p_template_id
  for update;

  if not found then raise exception 'quote_flow_template_not_found'; end if;
  if template_row.revision <> p_expected_revision then
    raise exception 'quote_flow_revision_conflict';
  end if;
  if template_row.status = 'archived' then
    raise exception 'quote_flow_template_archived';
  end if;

  next_version := template_row.current_version + 1;
  insert into public.remodel_quote_flow_template_versions (
    organization_id, template_id, version, name, description, definition,
    change_note, published_by
  ) values (
    template_row.organization_id, template_row.id, next_version,
    template_row.name, template_row.description, template_row.definition,
    left(coalesce(p_change_note, ''), 500), p_published_by
  );

  update public.remodel_quote_flow_templates
  set status = 'published', current_version = next_version,
      published_version = next_version, revision = revision + 1,
      updated_by = p_published_by, updated_at = now(), archived_at = null
  where organization_id = p_organization_id and id = p_template_id;

  return jsonb_build_object('templateId', p_template_id, 'version', next_version);
end;
$$;

revoke all on function public.remodel_publish_quote_flow_template(
  uuid, uuid, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.remodel_publish_quote_flow_template(
  uuid, uuid, integer, uuid, text
) to service_role;

create or replace function public.remodel_set_default_quote_flow_template(
  p_organization_id uuid,
  p_template_id uuid,
  p_updated_by uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.remodel_quote_flow_templates
  where organization_id = p_organization_id
    and id = p_template_id
    and status = 'published'
  for update;
  if not found then raise exception 'published_quote_flow_not_found'; end if;

  update public.remodel_quote_flow_templates
  set is_default = false
  where organization_id = p_organization_id and is_default = true;

  update public.remodel_quote_flow_templates
  set is_default = true, updated_by = p_updated_by, updated_at = now()
  where organization_id = p_organization_id and id = p_template_id;
  return true;
end;
$$;

revoke all on function public.remodel_set_default_quote_flow_template(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.remodel_set_default_quote_flow_template(
  uuid, uuid, uuid
) to service_role;

-- Runtime instances own the published definition they started with. Responses
-- and progress are stored separately from the quote record so arbitrary forms
-- can evolve without expanding the legacy quote JSON shape.
create table if not exists public.remodel_quote_flow_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  template_id uuid not null,
  template_version integer not null check (template_version > 0),
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  current_stage_id text not null check (length(trim(current_stage_id)) between 1 and 80),
  definition_snapshot jsonb not null check (jsonb_typeof(definition_snapshot) = 'object'),
  context_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context_snapshot) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, quote_id),
  foreign key (organization_id, template_id, template_version)
    references public.remodel_quote_flow_template_versions(organization_id, template_id, version)
    on delete restrict
);

create index if not exists remodel_quote_flow_instances_org_status
  on public.remodel_quote_flow_instances (organization_id, status, updated_at desc);

create table if not exists public.remodel_quote_flow_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null,
  stage_id text not null check (length(trim(stage_id)) between 1 and 80),
  block_id text not null check (length(trim(block_id)) between 1 and 80),
  value jsonb not null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_by_type text not null default 'staff'
    check (completed_by_type in ('staff', 'customer', 'system')),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, instance_id, stage_id, block_id),
  foreign key (organization_id, instance_id)
    references public.remodel_quote_flow_instances(organization_id, id)
    on delete cascade
);

create index if not exists remodel_quote_flow_values_instance
  on public.remodel_quote_flow_values (organization_id, instance_id, stage_id);

create table if not exists public.remodel_quote_flow_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null,
  stage_id text not null,
  block_id text not null,
  event_type text not null check (event_type in (
    'signed','initialed','signed_in_person','signed_on_behalf',
    'payment_completed','payment_refunded','required_steps_overridden','project_created'
  )),
  actor_type text not null check (actor_type in ('customer','staff','system')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, instance_id)
    references public.remodel_quote_flow_instances(organization_id, id)
    on delete cascade
);
create index if not exists remodel_quote_flow_events_instance
  on public.remodel_quote_flow_events
  (organization_id, instance_id, created_at, id);

alter table public.remodel_quote_flow_templates enable row level security;
alter table public.remodel_quote_flow_template_versions enable row level security;
alter table public.remodel_quote_flow_instances enable row level security;
alter table public.remodel_quote_flow_values enable row level security;
alter table public.remodel_quote_flow_events enable row level security;

revoke all on public.remodel_quote_flow_templates from public, anon, authenticated;
revoke all on public.remodel_quote_flow_template_versions from public, anon, authenticated;
revoke all on public.remodel_quote_flow_instances from public, anon, authenticated;
revoke all on public.remodel_quote_flow_values from public, anon, authenticated;
revoke all on public.remodel_quote_flow_events from public, anon, authenticated;

grant all on public.remodel_quote_flow_templates to service_role;
grant all on public.remodel_quote_flow_template_versions to service_role;
grant all on public.remodel_quote_flow_instances to service_role;
grant all on public.remodel_quote_flow_values to service_role;
grant all on public.remodel_quote_flow_events to service_role;

create or replace function public.remodel_complete_quote_flow_block(
  p_organization_id uuid,
  p_instance_id uuid,
  p_stage_id text,
  p_block_id text,
  p_value jsonb,
  p_completed_by uuid,
  p_actor_type text,
  p_event_type text,
  p_actor_name text,
  p_evidence jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed integer;
  completed_at timestamptz := now();
begin
  if not exists (
    select 1 from public.remodel_quote_flow_instances
    where organization_id = p_organization_id and id = p_instance_id
      and status = 'active'
  ) then raise exception 'quote_flow_instance_unavailable'; end if;

  insert into public.remodel_quote_flow_values (
    organization_id, instance_id, stage_id, block_id, value,
    completed_by, completed_by_type, completed_at, updated_at
  ) values (
    p_organization_id, p_instance_id, p_stage_id, p_block_id, p_value,
    p_completed_by, p_actor_type, completed_at, completed_at
  ) on conflict (organization_id, instance_id, stage_id, block_id) do nothing;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  insert into public.remodel_quote_flow_events (
    organization_id, instance_id, stage_id, block_id, event_type,
    actor_type, actor_id, actor_name, evidence, created_at
  ) values (
    p_organization_id, p_instance_id, p_stage_id, p_block_id, p_event_type,
    p_actor_type, p_completed_by, p_actor_name, p_evidence, completed_at
  );
  update public.remodel_quote_flow_instances
  set updated_at = completed_at
  where organization_id = p_organization_id and id = p_instance_id;
  return true;
end
$$;
revoke all on function public.remodel_complete_quote_flow_block(
  uuid, uuid, text, text, jsonb, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.remodel_complete_quote_flow_block(
  uuid, uuid, text, text, jsonb, uuid, text, text, text, jsonb
) to service_role;

-- A signer, every field assigned to that signer, and the signature evidence
-- are committed together. A failed or concurrent request cannot leave a
-- partially signed packet behind.
create or replace function public.remodel_sign_agreement_signer(
  p_organization_id uuid,
  p_packet_id uuid,
  p_signer_id uuid,
  p_field_values jsonb,
  p_signature_evidence jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  signer_order integer;
  changed integer;
  item jsonb;
  completed_at_value timestamptz := now();
begin
  select signing_order into signer_order
  from public.remodel_agreement_signers
  where organization_id = p_organization_id
    and packet_id = p_packet_id
    and id = p_signer_id
    and status <> 'signed'
  for update;
  if signer_order is null then return false; end if;

  if exists (
    select 1 from public.remodel_agreement_signers
    where organization_id = p_organization_id
      and packet_id = p_packet_id
      and signing_order < signer_order
      and status <> 'signed'
  ) then raise exception 'agreement_signing_order_conflict'; end if;

  if not exists (
    select 1 from public.remodel_agreement_packets
    where organization_id = p_organization_id and id = p_packet_id
      and status in ('sent', 'in_progress')
  ) then raise exception 'agreement_packet_unavailable'; end if;

  for item in select value from jsonb_array_elements(p_field_values)
  loop
    insert into public.remodel_agreement_field_values (
      organization_id, packet_id, field_id, signer_id, value, completed_at
    ) values (
      p_organization_id, p_packet_id, item->>'fieldId', p_signer_id,
      item->'value', completed_at_value
    );
  end loop;

  update public.remodel_agreement_signers
  set status = 'signed', signed_at = completed_at_value,
      signature_evidence = p_signature_evidence
  where organization_id = p_organization_id and id = p_signer_id
    and packet_id = p_packet_id and status <> 'signed';
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  update public.remodel_agreement_packets
  set status = 'in_progress'
  where organization_id = p_organization_id and id = p_packet_id
    and status = 'sent';
  return true;
end
$$;
revoke all on function public.remodel_sign_agreement_signer(
  uuid, uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.remodel_sign_agreement_signer(
  uuid, uuid, uuid, jsonb, jsonb
) to service_role;

-- Preserve Premium Remodel exactly: this definition points at the existing
-- quote, MSA, signing, deposit, and promotion renderers rather than replacing
-- any of those proven implementations.
insert into public.remodel_quote_flow_templates (
  organization_id, template_key, name, description, status, revision,
  current_version, published_version, definition, is_default, locked
)
select
  organization.id,
  'premium_remodel_quote_to_project',
  'Premium Remodel quote to project',
  'The existing Premium Remodel quote, MSA, signing, deposit, and project handoff.',
  'published', 0, 1, 1,
  jsonb_build_object(
    'schemaVersion', 1,
    'stages', jsonb_build_array(
      jsonb_build_object(
        'id', 'quote_and_pricing', 'type', 'quote_builder',
        'title', 'Quote & pricing',
        'description', 'Customer, items, costs, and price',
        'enabled', true, 'required', true, 'audience', 'staff',
        'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','customer','type','contact_fields','label','Customer contact','description','','enabled',true,'required',true,'audience','staff','bindingKey','quote.contact','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object()),
          jsonb_build_object('id','items','type','quote_items','label','Items, costs, and pricing','description','','enabled',true,'required',true,'audience','staff','bindingKey','quote.items','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('renderer','premium_quote_builder_v1')),
          jsonb_build_object('id','scope','type','scope_of_work','label','Scope of work','description','','enabled',true,'required',true,'audience','both','bindingKey','quote.scope','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object()),
          jsonb_build_object('id','notes','type','notes','label','Notes','description','','enabled',true,'required',false,'audience','staff','bindingKey','quote.notes','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object()),
          jsonb_build_object('id','photos','type','photos_attachments','label','Photos & attachments','description','','enabled',true,'required',false,'audience','both','bindingKey','quote.attachments','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object())
        )
      ),
      jsonb_build_object(
        'id', 'agreement_details', 'type', 'agreement_details',
        'title', 'Agreement details',
        'description', 'Dates, payments, parties, and terms',
        'enabled', true, 'required', true, 'audience', 'staff',
        'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','premium_msa','type','generated_document','label','Master services agreement','description','','enabled',true,'required',true,'audience','both','bindingKey','agreement.premium_msa','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('templateKey','premium_remodel_master_services_agreement','renderer','legacy_premium_msa_v1')),
          jsonb_build_object('id','payment_schedule','type','payment_schedule','label','Payment checkpoints','description','','enabled',true,'required',true,'audience','both','bindingKey','agreement.payment_schedule','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object()),
          jsonb_build_object('id','agreement_terms','type','terms_disclosures','label','Agreement terms','description','','enabled',true,'required',true,'audience','customer','bindingKey','agreement.terms','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object())
        )
      ),
      jsonb_build_object(
        'id', 'company_approval', 'type', 'signature_collection',
        'title', 'Company approval',
        'description', 'Review and sign as the company representative',
        'enabled', true, 'required', true, 'audience', 'staff',
        'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','staff_signature','type','signature','label','Company representative signature','description','','enabled',true,'required',true,'audience','staff','bindingKey','agreement.staff_signature','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('signerRoleId','staff','order',1,'methods',jsonb_build_array('onsite'),'renderer','legacy_premium_msa_staff_v1'))
        )
      ),
      jsonb_build_object(
        'id', 'send_and_complete', 'type', 'delivery',
        'title', 'Customer completion',
        'description', 'Share the packet and collect customer signatures',
        'enabled', true, 'required', true, 'audience', 'both',
        'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','delivery','type','delivery_controls','label','Email, portal, or on-device signing','description','','enabled',true,'required',true,'audience','staff','bindingKey','delivery','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('renderer','legacy_quote_portal_v1')),
          jsonb_build_object('id','quote_signature','type','signature','label','Quote acceptance','description','','enabled',true,'required',true,'audience','customer','bindingKey','quote.customer_signature','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('signerRoleId','customer','order',1)),
          jsonb_build_object('id','msa_signature','type','signature','label','Service agreement signature','description','','enabled',true,'required',true,'audience','customer','bindingKey','agreement.customer_signature','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('signerRoleId','customer','order',2))
        )
      ),
      jsonb_build_object(
        'id', 'deposit', 'type', 'deposit_payment',
        'title', 'Deposit',
        'description', 'Collect online or record an offline payment',
        'enabled', true, 'required', true, 'audience', 'both',
        'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','deposit','type','deposit_collection','label','Deposit received','description','','enabled',true,'required',true,'audience','both','bindingKey','payment.deposit','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('providers',jsonb_build_array('stripe','manual_check')))
        )
      ),
      jsonb_build_object(
        'id', 'create_project', 'type', 'project_conversion',
        'title', 'Create project',
        'description', 'Carry accepted items into Planning',
        'enabled', true, 'required', true, 'audience', 'staff',
        'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
        'blocks', jsonb_build_array(
          jsonb_build_object('id','project_conversion','type','project_conversion','label','Create Planning project','description','','enabled',true,'required',true,'audience','staff','bindingKey','project.conversion','conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),'config',jsonb_build_object('renderer','premium_quote_promotion_v1'))
        )
      )
    )
  ),
  true, true
from public.organizations organization
where lower(trim(organization.name)) = 'premium remodel'
on conflict (organization_id, template_key) do nothing;

insert into public.remodel_quote_flow_template_versions (
  organization_id, template_id, version, name, description, definition,
  change_note
)
select template.organization_id, template.id, 1, template.name,
  template.description, template.definition,
  'Captured the existing Premium Remodel workflow without changing its behavior.'
from public.remodel_quote_flow_templates template
where template.template_key = 'premium_remodel_quote_to_project'
on conflict (organization_id, template_id, version) do nothing;

create or replace function public.remodel_complete_quote_flow(
  p_organization_id uuid,
  p_instance_id uuid,
  p_quote_id uuid,
  p_expected_updated_at text,
  p_project_data jsonb,
  p_actor_id uuid,
  p_actor_name text,
  p_stage_id text,
  p_block_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed integer;
begin
  update public.remodel_records
  set kind = 'project', data = p_project_data,
      updated_at = p_project_data->>'updatedAt', updated_by = p_actor_id
  where organization_id = p_organization_id and id = p_quote_id
    and kind = 'quote' and updated_at = p_expected_updated_at;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  update public.remodel_quote_flow_instances
  set status = 'completed', completed_at = now(), updated_at = now()
  where organization_id = p_organization_id and id = p_instance_id
    and quote_id = p_quote_id and status = 'active';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'quote_flow_instance_changed';
  end if;

  insert into public.remodel_quote_flow_events (
    organization_id, instance_id, stage_id, block_id, event_type,
    actor_type, actor_id, actor_name, evidence
  ) values (
    p_organization_id, p_instance_id, p_stage_id, p_block_id,
    'project_created', 'staff', p_actor_id, p_actor_name,
    jsonb_build_object('quoteId', p_quote_id, 'createdAt', now())
  );
  return true;
end
$$;
revoke all on function public.remodel_complete_quote_flow(
  uuid, uuid, uuid, text, jsonb, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.remodel_complete_quote_flow(
  uuid, uuid, uuid, text, jsonb, uuid, text, text, text
) to service_role;

commit;
