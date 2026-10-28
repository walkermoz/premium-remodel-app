begin;

-- Save a quote's complete scope order in one transaction. The API calls this
-- with a service-role client after checking the user's organization and access.
create or replace function public.remodel_reorder_quote_scope(
  target_organization uuid,
  target_quote uuid,
  ordered_ids uuid[],
  expected_versions text[],
  moving_id uuid,
  next_section_id text,
  next_section_name text,
  actor_profile uuid
)
returns setof jsonb
language plpgsql
set search_path = ''
as $$
declare
  parent_status text;
  scope_count integer;
  next_version text;
begin
  if coalesce(cardinality(ordered_ids), 0) < 1
    or cardinality(ordered_ids) > 1000
    or cardinality(ordered_ids) <> coalesce(cardinality(expected_versions), 0)
    or moving_id is null
    or not (moving_id = any(ordered_ids))
  then
    raise exception 'Invalid quote row order.' using errcode = '22023';
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

  perform 1
  from public.remodel_records as record
  where record.organization_id = target_organization
    and record.project_id = target_quote
    and record.kind = 'scope'
  order by record.id
  for update;

  select count(*) into scope_count
  from public.remodel_records as record
  where record.organization_id = target_organization
    and record.project_id = target_quote
    and record.kind = 'scope';
  if scope_count <> cardinality(ordered_ids)
    or (select count(distinct requested.id)
        from unnest(ordered_ids) as requested(id)) <> scope_count
  then
    raise exception 'Quote rows changed. Refresh and try again.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(ordered_ids, expected_versions) as requested(id, version)
    left join public.remodel_records as record
      on record.organization_id = target_organization
      and record.project_id = target_quote
      and record.kind = 'scope'
      and record.id = requested.id
    where record.id is null
      or requested.version is null
      or record.updated_at <> requested.version
  ) then
    raise exception 'Quote rows changed. Refresh and try again.' using errcode = 'P0001';
  end if;

  next_version := to_char(
    clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  );

  return query
  with requested as (
    select entry.id, (entry.ordinality - 1)::integer as position
    from unnest(ordered_ids) with ordinality as entry(id, ordinality)
  )
  update public.remodel_records as record
  set data = jsonb_set(
        jsonb_set(
          case when record.id = moving_id then
            jsonb_set(
              jsonb_set(record.data, '{sectionId}', to_jsonb(next_section_id), true),
              '{sectionName}', to_jsonb(next_section_name), true
            )
          else record.data end,
          '{position}', to_jsonb(requested.position), true
        ),
        '{updatedAt}', to_jsonb(next_version), true
      ),
      updated_at = next_version,
      updated_by = actor_profile
  from requested
  where record.organization_id = target_organization
    and record.project_id = target_quote
    and record.kind = 'scope'
    and record.id = requested.id
  returning record.data;
end;
$$;

revoke all on function public.remodel_reorder_quote_scope(
  uuid, uuid, uuid[], text[], uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.remodel_reorder_quote_scope(
  uuid, uuid, uuid[], text[], uuid, text, text, uuid
) to service_role;

commit;
