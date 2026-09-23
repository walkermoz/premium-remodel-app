begin;

create table if not exists public.remodel_client_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0),
  unique (organization_id, project_id),
  foreign key (organization_id, project_id)
    references public.remodel_records(organization_id, id) on delete cascade
);

create index if not exists remodel_client_links_active
  on public.remodel_client_links (organization_id, project_id)
  where revoked_at is null;

alter table public.remodel_client_links enable row level security;
revoke all on public.remodel_client_links from public, anon, authenticated;
grant all on public.remodel_client_links to service_role;

create or replace function public.remodel_note_client_portal_view(target_link uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched_id uuid;
begin
  update public.remodel_client_links
  set last_viewed_at = now(), view_count = view_count + 1
  where id = target_link and revoked_at is null
  returning id into touched_id;
  return touched_id is not null;
end;
$$;

revoke all on function public.remodel_note_client_portal_view(uuid)
  from public, anon, authenticated;
grant execute on function public.remodel_note_client_portal_view(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
