-- Organization memberships are separate from the user's home profile. A person
-- may work for several businesses, but each request resolves to one membership.
begin;

create table if not exists public.remodel_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','office','crew','field','doorknocker')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);
create index if not exists remodel_memberships_profile on public.remodel_memberships(profile_id, active);
alter table public.remodel_memberships enable row level security;
revoke all on public.remodel_memberships from public, anon, authenticated;
grant all on public.remodel_memberships to service_role;

-- Personal integrations and live location state must be independent for each
-- company when the same profile belongs to multiple organizations.
alter table public.remodel_locations drop constraint if exists remodel_locations_pkey;
alter table public.remodel_locations add primary key (organization_id, profile_id);
alter table public.remodel_google_calendar_connections
  drop constraint if exists remodel_google_calendar_connections_pkey;
alter table public.remodel_google_calendar_connections
  add primary key (organization_id, profile_id);

insert into public.remodel_memberships (organization_id, profile_id, role, active)
select organization_id, id, role::text, active
from public.profiles
where role::text in ('owner','admin','office','crew','field','doorknocker')
on conflict (organization_id, profile_id) do nothing;

create or replace function public.remodel_profile_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role::text in ('owner','admin','office','crew','field','doorknocker') then
    insert into public.remodel_memberships(organization_id, profile_id, role, active)
    values (new.organization_id, new.id, new.role::text, new.active)
    on conflict (organization_id, profile_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.remodel_profile_membership() from public, anon, authenticated;
drop trigger if exists remodel_profile_membership_insert on public.profiles;
create trigger remodel_profile_membership_insert after insert on public.profiles
for each row execute function public.remodel_profile_membership();

-- PostgREST exposes the request header to this function. The header selects a
-- workspace; it never grants one. A membership must still exist and be active.
create or replace function public.remodel_current_member()
returns table(id uuid, organization_id uuid, auth_user_id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = '' as $$
  with selected as (
    select nullif(coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb)
      ->> 'x-remodel-organization-id', '') as organization_id
  )
  select p.id, m.organization_id, p.auth_user_id, p.full_name, p.email, m.role
  from public.profiles p
  join public.remodel_memberships m on m.profile_id = p.id
  cross join selected s
  where p.auth_user_id = (select auth.uid()) and p.active and m.active
    and exists (select 1 from auth.sessions session
      where session.user_id = (select auth.uid())
        and session.id::text = (select auth.jwt()->>'session_id'))
    and (s.organization_id is null or m.organization_id::text = s.organization_id)
  order by (m.organization_id = p.organization_id) desc, m.created_at, m.organization_id
  limit 1
$$;
revoke all on function public.remodel_current_member() from public, anon;
grant execute on function public.remodel_current_member() to authenticated;

create or replace function public.remodel_active_membership(target_organization uuid, target_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.remodel_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = target_organization and m.profile_id = target_profile
      and target_organization = (select organization_id from public.remodel_current_member())
      and m.active and p.active)
$$;
revoke all on function public.remodel_active_membership(uuid,uuid) from public, anon;
grant execute on function public.remodel_active_membership(uuid,uuid) to authenticated;

drop policy if exists remodel_locations_read on public.remodel_locations;
create policy remodel_locations_read on public.remodel_locations for select to authenticated using (
  exists (select 1 from public.remodel_current_member() m
    where m.organization_id = remodel_locations.organization_id
      and (m.id = remodel_locations.profile_id or m.role in ('owner','admin')))
  and public.remodel_active_membership(remodel_locations.organization_id, remodel_locations.profile_id)
  and (captured_at is null or captured_at > now() - interval '1 hour')
);

create or replace function public.remodel_my_organizations()
returns table(organization_id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  select m.organization_id, o.name, m.role
  from public.profiles p
  join public.remodel_memberships m on m.profile_id = p.id and m.active
  join public.organizations o on o.id = m.organization_id
  where p.auth_user_id = (select auth.uid()) and p.active
    and exists (select 1 from auth.sessions session
      where session.user_id = (select auth.uid())
        and session.id::text = (select auth.jwt()->>'session_id'))
  order by (m.organization_id = p.organization_id) desc, o.name
$$;
revoke all on function public.remodel_my_organizations() from public, anon;
grant execute on function public.remodel_my_organizations() to authenticated;

create or replace function public.remodel_create_business(target_profile uuid, business_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_organization uuid;
begin
  if length(trim(business_name)) < 2 or length(trim(business_name)) > 120 then
    raise exception 'Invalid business name';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_profile and p.active) then
    raise exception 'Active profile required';
  end if;
  insert into public.organizations(id, name) values(gen_random_uuid(), trim(business_name))
    returning id into new_organization;
  insert into public.remodel_memberships(organization_id, profile_id, role, active)
    values(new_organization, target_profile, 'owner', true);
  return new_organization;
end;
$$;
revoke all on function public.remodel_create_business(uuid,text) from public, anon, authenticated;
grant execute on function public.remodel_create_business(uuid,text) to service_role;

-- Replace the two service-role RPCs that previously checked only the home
-- profile's organization. Their application callers already pass the active org.
create or replace function public.remodel_delete_record(
  target_organization uuid, target_id uuid, target_actor uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare removed_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    join public.remodel_memberships m on m.profile_id = p.id
    where p.id = target_actor and p.active and m.active
      and m.organization_id = target_organization
      and m.role in ('owner','admin','office','crew','field')
  ) then raise exception 'Active workspace member required'; end if;
  update public.remodel_records set updated_by = target_actor
    where organization_id = target_organization and id = target_id;
  delete from public.remodel_records
    where organization_id = target_organization and id = target_id
    returning id into removed_id;
  return removed_id is not null;
end;
$$;
revoke all on function public.remodel_delete_record(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.remodel_delete_record(uuid,uuid,uuid) to service_role;

create table if not exists public.remodel_business_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  version integer not null default 1,
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  quote_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(quote_preferences) = 'object'),
  navigation jsonb not null default '[]'::jsonb check (jsonb_typeof(navigation) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.remodel_business_config enable row level security;
revoke all on public.remodel_business_config from public, anon, authenticated;
create policy remodel_business_config_read on public.remodel_business_config
for select to authenticated using (organization_id = (select organization_id from public.remodel_current_member()));
grant select on public.remodel_business_config to authenticated;
grant all on public.remodel_business_config to service_role;

create table if not exists public.remodel_pricebook_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  unit text not null default 'job',
  customer_rate_cents bigint not null default 0 check (customer_rate_cents >= 0),
  sub_rate_cents bigint not null default 0 check (sub_rate_cents >= 0),
  sub_unit text not null default 'job',
  material_rate_cents bigint not null default 0 check (material_rate_cents >= 0),
  material_unit text not null default 'job',
  revision integer not null default 1,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index if not exists remodel_pricebook_org_category on public.remodel_pricebook_items(organization_id, category, name);
alter table public.remodel_pricebook_items enable row level security;
revoke all on public.remodel_pricebook_items from public, anon, authenticated;
create policy remodel_pricebook_read on public.remodel_pricebook_items
for select to authenticated using (organization_id = (select organization_id from public.remodel_current_member()));
grant select on public.remodel_pricebook_items to authenticated;
grant all on public.remodel_pricebook_items to service_role;

-- Door visits remain available to users whose home profile is in another company.
create or replace function public.remodel_create_door_visit(
  p_organization uuid,
  p_actor uuid,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_visited_at timestamptz,
  p_outcome text,
  p_notes text,
  p_first_name text default null,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_zip text default null,
  p_project text default null,
  p_project_description text default null,
  p_quote_date text default null,
  p_quote_start_time text default null,
  p_quote_end_time text default null,
  p_quote_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit uuid := gen_random_uuid();
  v_contact uuid;
  v_lead uuid;
  v_now text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_actor_name text;
  v_name text;
  v_visit_data jsonb;
  v_contact_data jsonb;
  v_lead_data jsonb;
begin
  select p.full_name into v_actor_name
  from public.profiles p
  join public.remodel_memberships m on m.profile_id = p.id
  where p.id = p_actor
    and m.organization_id = p_organization
    and p.active = true and m.active = true
    and m.role in ('owner','admin','office','crew','field','doorknocker');
  if v_actor_name is null then raise exception 'Active workspace member required'; end if;

  if nullif(trim(coalesce(p_first_name, '')), '') is not null then
    v_contact := gen_random_uuid();
    v_lead := gen_random_uuid();
    v_name := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

    v_contact_data := jsonb_build_object(
      'id', v_contact::text,
      'firstName', coalesce(p_first_name, ''),
      'lastName', coalesce(p_last_name, ''),
      'name', v_name,
      'email', coalesce(p_email, ''),
      'phone', coalesce(p_phone, ''),
      'zip', coalesce(p_zip, ''),
      'address', p_address,
      'source', 'Door knocking',
      'createdAt', v_now,
      'updatedAt', v_now
    );
    insert into public.remodel_records (
      id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
    ) values (
      v_contact, p_organization, p_actor, p_actor, 'contact', null, v_contact_data, v_now
    );

    v_lead_data := jsonb_strip_nulls(jsonb_build_object(
      'id', v_lead::text,
      'contactId', v_contact::text,
      'name', v_name,
      'project', p_project,
      'projectDescription', p_project_description,
      'status', 'New',
      'source', 'Door knocking',
      'submittedAt', v_now,
      'quoteDate', nullif(p_quote_date, ''),
      'quoteStartTime', nullif(p_quote_start_time, ''),
      'quoteEndTime', nullif(p_quote_end_time, ''),
      'quoteNotes', nullif(p_quote_notes, ''),
      'canvasserId', p_actor::text,
      'canvasserName', v_actor_name,
      'createdAt', v_now,
      'updatedAt', v_now
    ));
    insert into public.remodel_records (
      id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
    ) values (
      v_lead, p_organization, p_actor, p_actor, 'lead', null, v_lead_data, v_now
    );
  end if;

  v_visit_data := jsonb_strip_nulls(jsonb_build_object(
    'id', v_visit::text,
    'name', p_address,
    'address', p_address,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'visitedAt', to_char(p_visited_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'outcome', p_outcome,
    'notes', coalesce(p_notes, ''),
    'canvasserId', p_actor::text,
    'canvasserName', v_actor_name,
    'leadId', case when v_lead is null then null else v_lead::text end,
    'createdAt', v_now,
    'updatedAt', v_now
  ));
  insert into public.remodel_records (
    id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
  ) values (
    v_visit, p_organization, p_actor, p_actor, 'door_visit', null, v_visit_data, v_now
  );

  return jsonb_build_object(
    'visit', v_visit_data,
    'contact', v_contact_data,
    'lead', v_lead_data
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
