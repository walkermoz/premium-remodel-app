begin;
create table if not exists public.remodel_locations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null,
  sharing boolean not null default false,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy double precision check (accuracy between 0 and 100000),
  captured_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists remodel_locations_company on public.remodel_locations(organization_id);
alter table public.remodel_locations enable row level security;
revoke all on public.remodel_locations from anon, authenticated;
grant select on public.remodel_locations to authenticated;
grant all on public.remodel_locations to service_role;
create policy remodel_locations_read on public.remodel_locations for select to authenticated using (
  exists (select 1 from public.remodel_current_member() m where m.organization_id = remodel_locations.organization_id
    and (m.id = remodel_locations.profile_id or m.role in ('owner','admin')))
  and exists (select 1 from public.profiles p where p.id = remodel_locations.profile_id and p.active = true and p.role::text in ('owner','admin','office','crew','field'))
  and (captured_at is null or captured_at > now() - interval '1 hour')
);

-- Delayed location requests cannot recreate a stopped session or overwrite a newer fix.
create or replace function public.remodel_update_location(
  p_profile uuid, p_org uuid, p_session uuid, p_lat double precision,
  p_lng double precision, p_accuracy double precision, p_captured timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare current_row public.remodel_locations;
begin
  select * into current_row from public.remodel_locations where profile_id = p_profile and organization_id = p_org for update;
  if not found or not current_row.sharing or current_row.session_id <> p_session then return false; end if;
  if current_row.captured_at is null or p_captured > current_row.captured_at then
    update public.remodel_locations set latitude = p_lat, longitude = p_lng, accuracy = p_accuracy,
      captured_at = p_captured, updated_at = now() where profile_id = p_profile and organization_id = p_org;
  end if;
  return true;
end $$;
revoke all on function public.remodel_update_location(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz) from public, anon, authenticated;
grant execute on function public.remodel_update_location(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
