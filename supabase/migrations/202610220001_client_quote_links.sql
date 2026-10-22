begin;

alter table public.remodel_client_links
  add column if not exists kind text not null default 'project';

alter table public.remodel_client_links
  add column if not exists quote_snapshot jsonb;

alter table public.remodel_client_links
  drop constraint if exists remodel_client_links_organization_id_project_id_key;

alter table public.remodel_client_links
  add constraint remodel_client_links_kind_check
  check (kind in ('project', 'quote'));

alter table public.remodel_client_links
  add constraint remodel_client_links_org_record_kind_key
  unique (organization_id, project_id, kind);

notify pgrst, 'reload schema';
commit;
