begin;

create table if not exists public.remodel_quote_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_number bigint not null check (last_number > 0)
);

alter table public.remodel_quote_counters enable row level security;
revoke all on public.remodel_quote_counters from public, anon, authenticated;
grant all on public.remodel_quote_counters to service_role;

create or replace function public.remodel_allocate_quote_number(
  target_organization uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  historical_max bigint;
  assigned_number bigint;
begin
  select coalesce(max((record.data->>'quoteNumber')::bigint), 0)
    into historical_max
  from public.remodel_records as record
  where record.organization_id = target_organization
    and record.kind in ('quote', 'project')
    and record.data->>'quoteNumber' ~ '^[0-9]{1,18}$';

  insert into public.remodel_quote_counters as counter (
    organization_id,
    last_number
  )
  values (target_organization, historical_max + 1)
  on conflict (organization_id) do update
    set last_number = greatest(counter.last_number, historical_max) + 1
  returning last_number into assigned_number;

  return assigned_number::text;
end
$$;

revoke all on function public.remodel_allocate_quote_number(uuid)
  from public, anon, authenticated;
grant execute on function public.remodel_allocate_quote_number(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
