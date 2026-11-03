begin;

-- Every customer-facing quote send freezes a numbered revision. The active
-- portal link points at one revision; replacing it rotates the token instead
-- of silently changing the document a customer may already be reviewing.
create table if not exists public.remodel_quote_document_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, quote_id, revision)
);

create index if not exists remodel_quote_document_revisions_quote
  on public.remodel_quote_document_revisions
  (organization_id, quote_id, revision desc);

alter table public.remodel_client_links
  add column if not exists document_revision_id uuid,
  add column if not exists document_revision integer;

alter table public.remodel_client_links
  drop constraint if exists remodel_client_links_document_revision_fk;
alter table public.remodel_client_links
  add constraint remodel_client_links_document_revision_fk
  foreign key (document_revision_id)
  references public.remodel_quote_document_revisions(id)
  on delete restrict;

alter table public.remodel_quote_document_revisions enable row level security;
revoke all on public.remodel_quote_document_revisions from public, anon, authenticated;
grant all on public.remodel_quote_document_revisions to service_role;

commit;
