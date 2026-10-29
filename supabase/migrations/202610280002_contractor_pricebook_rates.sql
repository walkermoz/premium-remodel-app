alter table public.remodel_pricebook_items
  add column if not exists contractor_rates jsonb not null default '[]'::jsonb
  check (jsonb_typeof(contractor_rates) = 'array');
