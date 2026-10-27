alter table public.remodel_business_config
  add column if not exists role_navigation jsonb not null default '{}'::jsonb
  check (jsonb_typeof(role_navigation) = 'object');
