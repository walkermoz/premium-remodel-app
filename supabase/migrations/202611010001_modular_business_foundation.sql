begin;

alter table public.remodel_business_config
  add column if not exists compliance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(compliance) = 'object'),
  add column if not exists regional jsonb not null default '{}'::jsonb
    check (jsonb_typeof(regional) = 'object'),
  add column if not exists role_permissions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(role_permissions) = 'object'),
  add column if not exists modules jsonb not null default '{}'::jsonb
    check (jsonb_typeof(modules) = 'object');

alter table public.remodel_api_keys
  add column if not exists scopes text[] not null default array[
    'leads.read',
    'leads.write.notes',
    'leads.write.stage',
    'leads.write.disposition',
    'leads.write.next_action',
    'leads.write.draft_reply',
    'leads.write.approval'
  ]::text[],
  add column if not exists expires_at timestamptz;

alter table public.remodel_client_links
  add column if not exists stripe_account_id text;

alter table public.remodel_api_keys
  drop constraint if exists remodel_api_keys_scopes_check;
alter table public.remodel_api_keys
  add constraint remodel_api_keys_scopes_check check (
    cardinality(scopes) between 1 and 7
    and scopes <@ array[
      'leads.read',
      'leads.write.notes',
      'leads.write.stage',
      'leads.write.disposition',
      'leads.write.next_action',
      'leads.write.draft_reply',
      'leads.write.approval'
    ]::text[]
  );

-- Preserve the current Premium Remodel behavior as tenant-owned configuration
-- before the platform begins onboarding additional organizations.
insert into public.remodel_business_config (
  organization_id,
  compliance,
  regional,
  modules,
  role_permissions
)
select
  o.id,
  jsonb_build_object(
    'legalName', 'Premium Living Home Improvement LLC d/b/a Premium Remodel',
    'smsProgramName', 'Premium Remodel',
    'privacyUrl', 'https://www.premiumremodel.com/privacy-policy',
    'termsUrl', 'https://www.premiumremodel.com/terms-and-conditions',
    'smsPolicyVersion', '2026-10-21',
    'helpEmail', 'contact@premiumremodel.com',
    'helpPhone', '(919) 454-4012',
    'checkPayee', 'Premium Living Home Improvement LLC d/b/a Premium Remodel',
    'checkMailingAddress', '309 Amiable Loop, Cary, North Carolina 27519'
  ),
  jsonb_build_object(
    'country', 'US',
    'currency', 'USD',
    'locale', 'en-US',
    'timezone', 'America/New_York',
    'serviceArea', 'Wake County, North Carolina'
  ),
  jsonb_build_object(
    'priceBook', true,
    'payments', true,
    'doorKnocking', true,
    'imageGeneration', true,
    'automations', true,
    'agreements', true
  ),
  jsonb_build_object(
    'owner', jsonb_build_array(
      'business.manage', 'branding.manage', 'team.manage',
      'permissions.manage', 'connections.manage', 'secrets.manage',
      'workflows.manage', 'agreements.manage', 'payments.manage',
      'compliance.manage', 'audit.view', 'alerts.manage', 'api_keys.manage',
      'pricebook.manage', 'quotes.manage', 'generation.manage', 'locations.view'
    ),
    'admin', jsonb_build_array(
      'business.manage', 'branding.manage', 'team.manage',
      'permissions.manage', 'connections.manage', 'secrets.manage',
      'workflows.manage', 'agreements.manage', 'payments.manage',
      'compliance.manage', 'audit.view', 'alerts.manage', 'api_keys.manage',
      'pricebook.manage', 'quotes.manage', 'generation.manage', 'locations.view'
    ),
    'office', '[]'::jsonb,
    'crew', '[]'::jsonb,
    'field', '[]'::jsonb,
    'doorknocker', '[]'::jsonb
  )
from public.organizations o
where lower(trim(o.name)) = 'premium remodel'
on conflict (organization_id) do update set
  compliance = excluded.compliance || public.remodel_business_config.compliance,
  regional = excluded.regional || public.remodel_business_config.regional,
  modules = excluded.modules || public.remodel_business_config.modules,
  role_permissions = excluded.role_permissions || public.remodel_business_config.role_permissions;

create table if not exists public.remodel_organization_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z][A-Za-z0-9_-]{1,79}$'),
  description text not null default '' check (length(description) <= 300),
  ciphertext text not null check (length(ciphertext) between 20 and 20000),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (organization_id, name),
  unique (organization_id, id)
);

create index if not exists remodel_organization_secrets_org_updated
  on public.remodel_organization_secrets (organization_id, updated_at desc);

alter table public.remodel_organization_secrets enable row level security;
revoke all on public.remodel_organization_secrets from public, anon, authenticated;
grant all on public.remodel_organization_secrets to service_role;

create table if not exists public.servicebuddy_platform_capabilities (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null check (capability in ('platform_owner')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, capability)
);

alter table public.servicebuddy_platform_capabilities enable row level security;
revoke all on public.servicebuddy_platform_capabilities from public, anon, authenticated;
grant all on public.servicebuddy_platform_capabilities to service_role;

insert into public.servicebuddy_platform_capabilities (profile_id, capability)
select p.id, 'platform_owner'
from public.profiles p
where lower(p.email) = 'walker@premiumremodel.com'
on conflict (profile_id, capability) do nothing;

create table if not exists public.remodel_workflow_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.remodel_workflows(id) on delete cascade,
  run_id uuid not null references public.remodel_workflow_runs(id) on delete cascade,
  node_id text not null check (length(trim(node_id)) between 1 and 120),
  node_name text not null check (length(trim(node_name)) between 1 and 200),
  error_code text not null check (length(trim(error_code)) between 1 and 100),
  error_detail text not null check (length(error_detail) between 1 and 2000),
  status text not null default 'open' check (status in ('open','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  in_app_notified_at timestamptz,
  email_status text not null default 'pending'
    check (email_status in ('pending','sent','failed','unavailable')),
  email_detail text check (email_detail is null or length(email_detail) <= 500),
  email_attempted_at timestamptz,
  email_recipients jsonb not null default '[]'::jsonb
    check (jsonb_typeof(email_recipients) = 'array'),
  unique (organization_id, run_id, node_id)
);

create index if not exists remodel_workflow_incidents_open
  on public.remodel_workflow_incidents (organization_id, status, last_seen_at desc);

alter table public.remodel_workflow_incidents enable row level security;
revoke all on public.remodel_workflow_incidents from public, anon, authenticated;
grant all on public.remodel_workflow_incidents to service_role;

-- Secret values remain service-role-only. The application returns metadata DTOs
-- after checking the active organization and the secrets.manage capability.

alter table public.remodel_workflow_inbound_webhooks
  add column if not exists auth_mode text not null default 'none'
    check (auth_mode in ('none', 'header', 'hmac_sha256')),
  add column if not exists auth_header text
    check (auth_header is null or auth_header ~ '^[A-Za-z0-9!#$%&''*+.^_`|~-]{1,120}$'),
  add column if not exists auth_secret_ciphertext text
    check (
      auth_secret_ciphertext is null
      or length(auth_secret_ciphertext) between 20 and 20000
    );

-- Agreement templates belong to an organization. Published versions are
-- immutable snapshots so editing a template can never change an agreement
-- that has already been sent for signature.
create table if not exists public.remodel_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text,
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  source_type text not null check (
    source_type in ('uploaded_pdf', 'servicebuddy_document', 'legacy_premium_msa')
  ),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  revision integer not null default 0 check (revision >= 0),
  current_version integer not null default 0 check (current_version >= 0),
  published_version integer check (published_version is null or published_version > 0),
  content jsonb,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  signer_roles jsonb not null default '[]'::jsonb check (jsonb_typeof(signer_roles) = 'array'),
  storage_path text,
  original_filename text,
  mime_type text,
  file_sha256 text,
  page_count integer check (page_count is null or page_count between 1 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, template_key),
  check (
    (source_type = 'uploaded_pdf' and storage_path is not null and file_sha256 is not null)
    or source_type in ('servicebuddy_document', 'legacy_premium_msa')
  )
);

create index if not exists remodel_agreement_templates_org_status
  on public.remodel_agreement_templates (organization_id, status, updated_at desc);

create table if not exists public.remodel_agreement_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  version integer not null check (version > 0),
  name text not null,
  description text not null default '',
  source_type text not null check (
    source_type in ('uploaded_pdf', 'servicebuddy_document', 'legacy_premium_msa')
  ),
  content jsonb,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  signer_roles jsonb not null default '[]'::jsonb check (jsonb_typeof(signer_roles) = 'array'),
  storage_path text,
  original_filename text,
  mime_type text,
  file_sha256 text,
  page_count integer,
  change_note text not null default '' check (length(change_note) <= 500),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (organization_id, template_id, version),
  foreign key (organization_id, template_id)
    references public.remodel_agreement_templates(organization_id, id)
    on delete cascade
);

create index if not exists remodel_agreement_versions_template
  on public.remodel_agreement_template_versions
  (organization_id, template_id, version desc);

create or replace function public.remodel_publish_agreement_template(
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
  template_row public.remodel_agreement_templates%rowtype;
  next_version integer;
begin
  select * into template_row
  from public.remodel_agreement_templates
  where organization_id = p_organization_id
    and id = p_template_id
  for update;

  if not found then
    raise exception 'agreement_template_not_found';
  end if;
  if template_row.revision <> p_expected_revision then
    raise exception 'agreement_revision_conflict';
  end if;
  if template_row.status = 'archived' then
    raise exception 'agreement_template_archived';
  end if;

  next_version := template_row.current_version + 1;
  insert into public.remodel_agreement_template_versions (
    organization_id, template_id, version, name, description, source_type,
    content, fields, signer_roles, storage_path, original_filename, mime_type,
    file_sha256, page_count, change_note, published_by
  ) values (
    template_row.organization_id, template_row.id, next_version,
    template_row.name, template_row.description, template_row.source_type,
    template_row.content, template_row.fields, template_row.signer_roles,
    template_row.storage_path, template_row.original_filename,
    template_row.mime_type, template_row.file_sha256, template_row.page_count,
    left(coalesce(p_change_note, ''), 500), p_published_by
  );

  update public.remodel_agreement_templates
  set status = 'published',
      current_version = next_version,
      published_version = next_version,
      revision = revision + 1,
      updated_by = p_published_by,
      updated_at = now(),
      archived_at = null
  where organization_id = p_organization_id and id = p_template_id;

  return jsonb_build_object(
    'templateId', p_template_id,
    'version', next_version
  );
end;
$$;

revoke all on function public.remodel_publish_agreement_template(
  uuid, uuid, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.remodel_publish_agreement_template(
  uuid, uuid, integer, uuid, text
) to service_role;

create table if not exists public.remodel_agreement_packets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  template_version integer not null check (template_version > 0),
  project_id uuid,
  contact_id uuid,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'in_progress', 'completed', 'void')
  ),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  data_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(data_snapshot) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, template_id, template_version)
    references public.remodel_agreement_template_versions(organization_id, template_id, version)
    on delete restrict
);

create index if not exists remodel_agreement_packets_org_status
  on public.remodel_agreement_packets (organization_id, status, created_at desc);

create table if not exists public.remodel_agreement_signers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  packet_id uuid not null,
  role_id text not null check (length(trim(role_id)) between 1 and 80),
  role_label text not null check (length(trim(role_label)) between 1 and 120),
  party_type text not null check (party_type in ('customer', 'staff', 'other')),
  signing_order integer not null check (signing_order between 1 and 50),
  name text not null check (length(trim(name)) between 1 and 200),
  email text not null check (length(trim(email)) between 3 and 320),
  status text not null default 'pending' check (
    status in ('pending', 'notified', 'viewed', 'signed', 'declined')
  ),
  access_token_hash text unique,
  access_token_expires_at timestamptz,
  notified_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  signature_evidence jsonb,
  unique (organization_id, packet_id, role_id),
  unique (organization_id, id),
  foreign key (organization_id, packet_id)
    references public.remodel_agreement_packets(organization_id, id)
    on delete cascade
);

create index if not exists remodel_agreement_signers_packet_order
  on public.remodel_agreement_signers (organization_id, packet_id, signing_order);

create table if not exists public.remodel_agreement_field_values (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  packet_id uuid not null,
  field_id text not null check (length(trim(field_id)) between 1 and 80),
  signer_id uuid,
  value jsonb not null,
  completed_at timestamptz not null default now(),
  primary key (organization_id, packet_id, field_id),
  foreign key (organization_id, packet_id)
    references public.remodel_agreement_packets(organization_id, id)
    on delete cascade,
  foreign key (organization_id, signer_id)
    references public.remodel_agreement_signers(organization_id, id)
    on delete restrict
);

alter table public.remodel_agreement_templates enable row level security;
alter table public.remodel_agreement_template_versions enable row level security;
alter table public.remodel_agreement_packets enable row level security;
alter table public.remodel_agreement_signers enable row level security;
alter table public.remodel_agreement_field_values enable row level security;

revoke all on public.remodel_agreement_templates from public, anon, authenticated;
revoke all on public.remodel_agreement_template_versions from public, anon, authenticated;
revoke all on public.remodel_agreement_packets from public, anon, authenticated;
revoke all on public.remodel_agreement_signers from public, anon, authenticated;
revoke all on public.remodel_agreement_field_values from public, anon, authenticated;

grant all on public.remodel_agreement_templates to service_role;
grant all on public.remodel_agreement_template_versions to service_role;
grant all on public.remodel_agreement_packets to service_role;
grant all on public.remodel_agreement_signers to service_role;
grant all on public.remodel_agreement_field_values to service_role;

create table if not exists public.remodel_payment_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  connection_mode text not null check (connection_mode in ('stripe_connect')),
  status text not null default 'pending' check (
    status in ('pending', 'active', 'restricted', 'disconnected')
  ),
  external_account_id text not null check (length(trim(external_account_id)) between 3 and 255),
  display_name text not null default '' check (length(display_name) <= 200),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (organization_id, provider),
  unique (provider, external_account_id),
  unique (organization_id, id)
);

create index if not exists remodel_payment_connections_org_status
  on public.remodel_payment_connections (organization_id, provider, status);

alter table public.remodel_payment_connections enable row level security;
revoke all on public.remodel_payment_connections from public, anon, authenticated;
grant all on public.remodel_payment_connections to service_role;

create table if not exists public.remodel_organization_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- This is a platform tombstone, so it deliberately outlives the organization.
  organization_id uuid not null,
  organization_name text not null default '',
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'failed', 'cancelled', 'completed')
  ),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  processing_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  last_error text
);

-- Keep the full request history while allowing only one live deletion timer.
-- A normal unique (organization_id, status) constraint would prevent a company
-- from cancelling and later creating a second request.
create unique index if not exists remodel_org_deletion_one_pending
  on public.remodel_organization_deletion_requests (organization_id)
  where status in ('pending', 'processing', 'failed');

create index if not exists remodel_org_deletion_pending
  on public.remodel_organization_deletion_requests (status, delete_after)
  where status in ('pending', 'failed');

alter table public.remodel_organization_deletion_requests enable row level security;
revoke all on public.remodel_organization_deletion_requests from public, anon, authenticated;
grant all on public.remodel_organization_deletion_requests to service_role;

-- Final database removal is one transaction and can only run for a claimed,
-- due lifecycle request. Provider revocation and storage cleanup happen before
-- this RPC; any database failure rolls the entire database phase back.
create or replace function public.servicebuddy_delete_organization(
  p_organization uuid,
  p_request uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.remodel_organization_deletion_requests
  where id = p_request
    and organization_id = p_organization
    and status = 'processing'
    and delete_after <= now()
  for update;
  if not found then
    raise exception 'Deletion request is not claimed and due.';
  end if;

  -- A profile may belong to several organizations. Move its home organization
  -- before deleting this one; remove the profile only when it has no other home.
  update public.profiles profile
  set organization_id = (
    select membership.organization_id
    from public.remodel_memberships membership
    where membership.profile_id = profile.id
      and membership.organization_id <> p_organization
      and membership.active = true
    order by membership.created_at, membership.organization_id
    limit 1
  )
  where profile.organization_id = p_organization
    and exists (
      select 1 from public.remodel_memberships membership
      where membership.profile_id = profile.id
        and membership.organization_id <> p_organization
        and membership.active = true
    );

  delete from public.profiles profile
  where profile.organization_id = p_organization
    and not exists (
      select 1 from public.remodel_memberships membership
      where membership.profile_id = profile.id
        and membership.organization_id <> p_organization
        and membership.active = true
    );

  -- The oldest workspace table predates cascading organization deletes and has
  -- a self-reference from child records to their project.
  delete from public.remodel_records
  where organization_id = p_organization and project_id is not null;
  delete from public.remodel_records where organization_id = p_organization;
  delete from public.organizations where id = p_organization;

  update public.remodel_organization_deletion_requests
  set status = 'completed', completed_at = now(), last_error = null
  where id = p_request and status = 'processing';
  return true;
end
$$;
revoke all on function public.servicebuddy_delete_organization(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.servicebuddy_delete_organization(uuid, uuid)
  to service_role;

-- Register the existing legal document only in Premium Remodel. Other
-- organizations start with an empty library and must upload or author their
-- own agreement; Premium's legal terms are never copied to them.
insert into public.remodel_agreement_templates (
  organization_id,
  template_key,
  name,
  description,
  source_type,
  status,
  revision,
  current_version,
  published_version,
  content,
  fields,
  signer_roles
)
select
  o.id,
  'premium_remodel_master_services_agreement',
  'Master services agreement',
  'Premium Remodel’s current project agreement and exhibits.',
  'legacy_premium_msa',
  'published',
  0,
  1,
  1,
  jsonb_build_object('renderer', 'legacy_premium_msa_v1'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'id', 'staff', 'label', 'Premium Remodel representative',
      'partyType', 'staff', 'order', 1, 'required', true,
      'nameBinding', 'agreement.staff.name', 'emailBinding', null
    ),
    jsonb_build_object(
      'id', 'customer', 'label', 'Customer',
      'partyType', 'customer', 'order', 2, 'required', true,
      'nameBinding', 'contact.name', 'emailBinding', 'contact.email'
    )
  )
from public.organizations o
where lower(trim(o.name)) = 'premium remodel'
on conflict (organization_id, template_key) do nothing;

insert into public.remodel_agreement_template_versions (
  organization_id,
  template_id,
  version,
  name,
  description,
  source_type,
  content,
  fields,
  signer_roles,
  change_note
)
select
  t.organization_id,
  t.id,
  1,
  t.name,
  t.description,
  t.source_type,
  t.content,
  t.fields,
  t.signer_roles,
  'Registered the existing Premium Remodel agreement as a tenant-owned template.'
from public.remodel_agreement_templates t
where t.template_key = 'premium_remodel_master_services_agreement'
on conflict (organization_id, template_id, version) do nothing;

commit;
