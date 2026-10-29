begin;

alter table public.remodel_pricebook_items
  add column if not exists customer_visible boolean not null default true;

insert into public.remodel_pricebook_items (
  id,
  organization_id,
  name,
  description,
  category,
  unit,
  customer_rate_cents,
  customer_visible,
  sub_rate_cents,
  sub_unit,
  material_rate_cents,
  material_unit,
  contractor_rates
)
select
  gen_random_uuid(),
  organization.id,
  'General company overhead',
  'General company overhead allocated by project duration.',
  'Overhead',
  'days',
  170000,
  false,
  0,
  'days',
  0,
  'days',
  '[]'::jsonb
from public.organizations organization
where lower(trim(organization.name)) = 'premium remodel'
  and not exists (
    select 1
    from public.remodel_pricebook_items existing
    where existing.organization_id = organization.id
      and lower(trim(existing.name)) = 'general company overhead'
  );

commit;
