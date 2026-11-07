begin;

create table if not exists public.remodel_google_business_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  google_account_id text not null,
  google_email text not null,
  refresh_token_ciphertext text not null,
  account_name text,
  location_name text,
  location_title text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remodel_google_business_location_pair check (
    (account_name is null and location_name is null and location_title is null)
    or (account_name is not null and location_name is not null and location_title is not null)
  )
);

alter table public.remodel_google_business_connections enable row level security;
revoke all on public.remodel_google_business_connections from public, anon, authenticated;
grant all on public.remodel_google_business_connections to service_role;

-- Existing organizations receive the new section once. Roles can change or
-- remove it later in the normal tab access editor.
update public.remodel_business_config as config
set navigation = config.navigation || '["Analytics"]'::jsonb
where config.navigation <> '[]'::jsonb
  and not config.navigation @> '["Analytics"]'::jsonb;

update public.remodel_business_config as config
set role_navigation = (
  select coalesce(jsonb_object_agg(role.key, case
    when role.key <> 'doorknocker'
      and jsonb_typeof(role.value) = 'array'
      and not role.value @> '["Analytics"]'::jsonb
    then role.value || '["Analytics"]'::jsonb
    else role.value
  end), '{}'::jsonb)
  from jsonb_each(config.role_navigation) as role(key, value)
)
where config.role_navigation <> '{}'::jsonb;

notify pgrst, 'reload schema';
commit;
