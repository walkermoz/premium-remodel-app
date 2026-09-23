-- Premium Remodel. Additive: retains existing jobs, company profiles, and logins.
begin;
create table if not exists public.remodel_records (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  created_by uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('project','task','contractor','scope','comment','attachment')),
  project_id uuid,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at text not null,
  unique (organization_id, id),
  foreign key (organization_id, project_id) references public.remodel_records(organization_id, id),
  check ((kind in ('project','contractor') and project_id is null) or (kind in ('task','scope','comment','attachment') and project_id is not null)),
  check (data->>'id' = id::text),
  check (data->>'updatedAt' = updated_at)
);
create index if not exists remodel_records_workspace on public.remodel_records (organization_id, updated_at desc, id);
create index if not exists remodel_records_project on public.remodel_records (organization_id, project_id, kind);
alter table public.remodel_records enable row level security;

-- Only active employees with a live Auth session may use the company workspace.
create or replace function public.remodel_current_member()
returns table(id uuid, organization_id uuid, auth_user_id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.organization_id, p.auth_user_id, p.full_name, p.email, p.role::text
  from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active = true
    and p.role::text in ('owner','admin','office','crew','field')
    and exists (select 1 from auth.sessions s where s.user_id = (select auth.uid()) and s.id::text = (select auth.jwt()->>'session_id'))
  limit 1
$$;
revoke all on function public.remodel_current_member() from public, anon;
grant execute on function public.remodel_current_member() to authenticated;
drop policy if exists remodel_company_read on public.remodel_records;
create policy remodel_company_read on public.remodel_records for select to authenticated
  using (organization_id = (select organization_id from public.remodel_current_member()));
-- Writes go through validated API routes so authors and company IDs cannot be forged.
revoke all on public.remodel_records from anon, authenticated;
grant select on public.remodel_records to authenticated;
grant all on public.remodel_records to service_role;

create table if not exists public.remodel_rate_limits (key text primary key, attempts integer not null, expires_at timestamptz not null);
alter table public.remodel_rate_limits enable row level security;
revoke all on public.remodel_rate_limits from anon, authenticated;
grant all on public.remodel_rate_limits to service_role;
create or replace function public.remodel_rate_limit(limit_key text)
returns integer language plpgsql security definer set search_path = '' as $$
declare result integer;
begin
  delete from public.remodel_rate_limits where expires_at <= now();
  insert into public.remodel_rate_limits(key, attempts, expires_at) values (limit_key, 1, now() + interval '15 minutes')
    on conflict (key) do update set attempts = public.remodel_rate_limits.attempts + 1 returning attempts into result;
  return result;
end
$$;
revoke all on function public.remodel_rate_limit(text) from public, anon, authenticated;
grant execute on function public.remodel_rate_limit(text) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('remodel-files', 'remodel-files', false, 4194304, array[
  'image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]) on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists remodel_private_files_read on storage.objects;
create policy remodel_private_files_read on storage.objects for select to authenticated
  using (bucket_id = 'remodel-files' and (storage.foldername(name))[1] = (select organization_id::text from public.remodel_current_member()));
notify pgrst, 'reload schema';
commit;
