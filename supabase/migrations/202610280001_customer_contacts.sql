begin;

-- Existing company navigation was saved before the customer Contacts tab existed.
update public.remodel_business_config as config
set navigation = case
  when config.navigation @> '["Leads"]'::jsonb then
    jsonb_insert(
      config.navigation,
      array[(
        select ordinal::text
        from jsonb_array_elements_text(config.navigation) with ordinality as item(value, ordinal)
        where item.value = 'Leads'
        limit 1
      )],
      '"Contacts"'::jsonb
    )
  else config.navigation || '["Contacts"]'::jsonb
end
where config.navigation <> '[]'::jsonb
  and not config.navigation @> '["Contacts"]'::jsonb;

update public.remodel_business_config as config
set role_navigation = (
  select coalesce(jsonb_object_agg(role.key, case
    when role.key <> 'doorknocker'
      and jsonb_typeof(role.value) = 'array'
      and (role.value @> '["Leads"]'::jsonb or role.value @> '["Quotes"]'::jsonb)
      and not role.value @> '["Contacts"]'::jsonb
    then role.value || '["Contacts"]'::jsonb
    else role.value
  end), '{}'::jsonb)
  from jsonb_each(config.role_navigation) as role(key, value)
)
where config.role_navigation <> '{}'::jsonb;

-- New intake paths already create contacts atomically. Repair only historical
-- non-junk leads whose contact is missing in their own organization.
do $$
declare
  lead_row record;
  contact_id uuid;
  contact_name text;
  first_name text;
  changed_at text;
begin
  for lead_row in
    select lead.*
    from public.remodel_records as lead
    where lead.kind = 'lead'
      and coalesce(lead.data->>'disposition', 'Active') not in ('Junk', 'Spam', 'Test')
      and not exists (
        select 1
        from public.remodel_records as contact
        where contact.organization_id = lead.organization_id
          and contact.kind = 'contact'
          and contact.id::text = lead.data->>'contactId'
      )
  loop
    contact_name := trim(coalesce(lead_row.data->>'name', ''));
    if contact_name = '' then continue; end if;
    first_name := split_part(contact_name, ' ', 1);
    contact_id := gen_random_uuid();
    changed_at := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    insert into public.remodel_records (
      id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
    ) values (
      contact_id,
      lead_row.organization_id,
      lead_row.created_by,
      lead_row.updated_by,
      'contact',
      null,
      jsonb_build_object(
        'id', contact_id::text,
        'firstName', first_name,
        'lastName', trim(substr(contact_name, length(first_name) + 2)),
        'name', contact_name,
        'email', lower(coalesce(lead_row.data->>'email', '')),
        'phone', coalesce(lead_row.data->>'phone', ''),
        'zip', coalesce(lead_row.data->>'zip', ''),
        'address', coalesce(lead_row.data->>'address', ''),
        'source', coalesce(nullif(lead_row.data->>'source', ''), 'Lead'),
        'createdAt', coalesce(lead_row.data->>'createdAt', changed_at),
        'updatedAt', changed_at
      ),
      changed_at
    );
    update public.remodel_records
    set data = jsonb_set(
          jsonb_set(data, '{contactId}', to_jsonb(contact_id::text), true),
          '{updatedAt}', to_jsonb(changed_at), true
        ),
        updated_at = changed_at
    where id = lead_row.id and organization_id = lead_row.organization_id;
  end loop;
end;
$$;

commit;
