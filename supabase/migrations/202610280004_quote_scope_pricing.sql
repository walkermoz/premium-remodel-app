begin;

-- Apply cost-based pricing to selected rows atomically after checking the
-- organization, quote status, row ownership and optimistic versions.
create or replace function public.remodel_price_quote_scope(
  target_organization uuid,
  target_quote uuid,
  selected_ids uuid[],
  expected_versions text[],
  sub_multiplier numeric,
  material_multiplier numeric,
  actor_profile uuid
)
returns setof jsonb
language plpgsql
set search_path = ''
as $$
declare
  parent_status text;
  next_version text;
begin
  if coalesce(cardinality(selected_ids), 0) < 1
    or cardinality(selected_ids) > 1000
    or cardinality(selected_ids) <> coalesce(cardinality(expected_versions), 0)
    or (select count(distinct id) from unnest(selected_ids) as selected(id)) <> cardinality(selected_ids)
    or sub_multiplier is null or sub_multiplier < 0 or sub_multiplier > 100
    or material_multiplier is null or material_multiplier < 0 or material_multiplier > 100
  then
    raise exception 'Invalid quote pricing selection or multipliers.' using errcode = '22023';
  end if;

  select parent.data->>'status' into parent_status
  from public.remodel_records as parent
  where parent.organization_id = target_organization
    and parent.id = target_quote
    and parent.kind = 'quote'
  for update;
  if not found then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  if parent_status = 'Accepted' then
    raise exception 'The signed quote scope cannot be changed.' using errcode = 'P0001';
  end if;

  perform 1 from public.remodel_records as record
  where record.organization_id = target_organization
    and record.project_id = target_quote
    and record.kind = 'scope'
    and record.id = any(selected_ids)
  order by record.id for update;

  if exists (
    select 1 from unnest(selected_ids, expected_versions) as selected(id, version)
    left join public.remodel_records as record
      on record.organization_id = target_organization
      and record.project_id = target_quote
      and record.kind = 'scope'
      and record.id = selected.id
    where record.id is null or selected.version is null
      or record.updated_at <> selected.version
      or case
        when coalesce(record.data->>'subCost', '0') ~ '^[0-9]+(\.[0-9]+)?$'
          and coalesce(record.data->>'materialCost', '0') ~ '^[0-9]+(\.[0-9]+)?$'
        then round(
          coalesce((record.data->>'subCost')::numeric, 0) * sub_multiplier +
          coalesce((record.data->>'materialCost')::numeric, 0) * material_multiplier,
          2
        ) > 1000000000
        else true
      end
  ) then
    raise exception 'Quote rows changed or their costs cannot be priced. Refresh and try again.' using errcode = 'P0001';
  end if;

  next_version := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  return query
  update public.remodel_records as record
  set data = jsonb_set(
    jsonb_set(record.data, '{estimate}', to_jsonb(round(
      coalesce((record.data->>'subCost')::numeric, 0) * sub_multiplier +
      coalesce((record.data->>'materialCost')::numeric, 0) * material_multiplier,
      2
    )), true),
    '{updatedAt}', to_jsonb(next_version), true
  ),
  updated_at = next_version,
  updated_by = actor_profile
  where record.organization_id = target_organization
    and record.project_id = target_quote
    and record.kind = 'scope'
    and record.id = any(selected_ids)
  returning record.data;
end;
$$;

revoke all on function public.remodel_price_quote_scope(
  uuid, uuid, uuid[], text[], numeric, numeric, uuid
) from public, anon, authenticated;
grant execute on function public.remodel_price_quote_scope(
  uuid, uuid, uuid[], text[], numeric, numeric, uuid
) to service_role;

commit;
