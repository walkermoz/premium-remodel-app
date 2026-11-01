-- Local Supabase bootstrap for platform tables that predate this repository's
-- first checked-in migration. Hosted environments already have these tables;
-- the CLI applies this file only while constructing an isolated local stack.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

do $$
begin
  create type public.user_role as enum ('owner', 'admin', 'office', 'crew', 'field', 'customer');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists profiles_organization
  on public.profiles (organization_id, active, role);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
revoke all on public.organizations, public.profiles from public, anon, authenticated;
grant all on public.organizations, public.profiles to service_role;
