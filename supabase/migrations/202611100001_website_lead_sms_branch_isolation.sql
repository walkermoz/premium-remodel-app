begin;

create or replace function public.remodel_workflow_find_or_create_contact(
  p_organization_id uuid,
  p_contact jsonb,
  p_match_existing boolean,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_email text := lower(trim(coalesce(p_contact->>'email', '')));
  v_phone text := trim(coalesce(p_contact->>'phone', ''));
  v_phone_key text;
  v_existing_phone_key text;
  v_lock text;
  v_data jsonb;
  v_reused boolean := false;
  v_changed boolean := false;
begin
  if jsonb_typeof(p_contact) <> 'object'
     or not exists (select 1 from public.organizations where id = p_organization_id)
  then raise exception 'Invalid Contact'; end if;

  v_phone_key := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if length(v_phone_key) = 11 and left(v_phone_key, 1) = '1' then
    v_phone_key := right(v_phone_key, 10);
  end if;

  if p_match_existing then
    for v_lock in
      select key from (
        select p_organization_id::text || ':email:' || v_email as key where v_email <> ''
        union
        select p_organization_id::text || ':phone:' || v_phone_key as key where v_phone_key <> ''
      ) keys order by key
    loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock, 0));
    end loop;

    if v_email <> '' then
      select id, data into v_contact_id, v_data
      from public.remodel_records
      where organization_id = p_organization_id and kind = 'contact'
        and lower(data->>'email') = v_email
      order by updated_at desc, id desc limit 1;

      if v_contact_id is not null and v_phone_key <> '' then
        v_existing_phone_key := regexp_replace(
          coalesce(v_data->>'phone', ''),
          '[^0-9]',
          '',
          'g'
        );
        if length(v_existing_phone_key) = 11
           and left(v_existing_phone_key, 1) = '1' then
          v_existing_phone_key := right(v_existing_phone_key, 10);
        end if;

        if v_existing_phone_key <> '' and v_existing_phone_key <> v_phone_key then
          -- The email belongs to a Contact with another saved number. Do not
          -- pair that Contact ID with the new website visitor's phone.
          v_contact_id := null;
          v_data := null;
        elsif v_existing_phone_key = '' then
          -- Filling an empty phone is safe and makes the saved Contact the
          -- authoritative recipient for the later consent-checked SMS step.
          v_data := jsonb_set(v_data, '{phone}', to_jsonb(v_phone), true)
            || jsonb_build_object('updatedAt', now()::text);
          v_changed := true;
        end if;
      end if;
    end if;

    if v_contact_id is null and v_phone_key <> '' then
      select id, data into v_contact_id, v_data
      from public.remodel_records
      where organization_id = p_organization_id and kind = 'contact'
        and (
          case
            when length(regexp_replace(coalesce(data->>'phone', ''), '[^0-9]', '', 'g')) = 11
              and left(regexp_replace(coalesce(data->>'phone', ''), '[^0-9]', '', 'g'), 1) = '1'
            then right(regexp_replace(coalesce(data->>'phone', ''), '[^0-9]', '', 'g'), 10)
            else regexp_replace(coalesce(data->>'phone', ''), '[^0-9]', '', 'g')
          end
        ) = v_phone_key
      order by updated_at desc, id desc limit 1;
    end if;
    v_reused := v_contact_id is not null;
  end if;

  if v_contact_id is null then
    v_contact_id := coalesce((p_contact->>'id')::uuid, gen_random_uuid());
    v_data := p_contact || jsonb_build_object(
      'id', v_contact_id,
      'createdAt', coalesce(p_contact->>'createdAt', now()::text),
      'updatedAt', coalesce(p_contact->>'updatedAt', now()::text)
    );
    insert into public.remodel_records (
      id, organization_id, kind, project_id, data, created_by, updated_by, updated_at
    ) values (
      v_contact_id, p_organization_id, 'contact', null, v_data,
      p_created_by, p_created_by, (v_data->>'updatedAt')::timestamptz
    );
  else
    v_data := v_data || jsonb_build_object('id', v_contact_id);
    if v_changed then
      update public.remodel_records
      set data = v_data, updated_by = coalesce(p_created_by, updated_by), updated_at = now()
      where organization_id = p_organization_id
        and kind = 'contact'
        and id = v_contact_id;
    end if;
  end if;

  return jsonb_build_object(
    'contact', v_data,
    'created', not v_reused,
    'reused', v_reused
  );
end;
$$;

revoke all on function public.remodel_workflow_find_or_create_contact(uuid,jsonb,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.remodel_workflow_find_or_create_contact(uuid,jsonb,boolean,uuid)
  to service_role;

create function pg_temp.use_saved_contact_phone(source_graph jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    source_graph,
    '{nodes}',
    (
      select jsonb_agg(
        case
          when node->>'id' in ('sms-policy', 'confirmation-sms') then
            jsonb_set(
              node,
              '{config,recipient}',
              '{"kind":"reference","path":"outputs.contactResult.contact.phone"}'::jsonb,
              true
            )
          else node
        end
        order by ordinal
      )
      from jsonb_array_elements(source_graph->'nodes')
        with ordinality as nodes(node, ordinal)
    ),
    true
  );
$$;

do $$
declare
  workflow_row record;
  next_version bigint;
  next_published_id uuid;
  upgraded_settings jsonb;
begin
  for workflow_row in
    select
      workflow.id as workflow_id,
      workflow.organization_id,
      workflow.published_version_id,
      workflow.current_draft_version_id,
      published.graph as published_graph,
      published.settings as published_settings,
      published.layout as published_layout
    from public.remodel_workflows workflow
    join public.remodel_workflow_versions published
      on published.id = workflow.published_version_id
    where workflow.workflow_key = 'website-lead-intake'
      and exists (
        select 1 from jsonb_array_elements(published.graph->'nodes') node
        where node->>'id' = 'find-contact'
          and node->>'type' = 'action.findOrCreateContact'
      )
      and exists (
        select 1 from jsonb_array_elements(published.graph->'nodes') node
        where node->>'id' = 'delivery-router'
          and node->>'type' = 'logic.router'
      )
      and (
        published.settings->>'failureBehavior' is distinct from 'continue'
        or exists (
          select 1 from jsonb_array_elements(published.graph->'nodes') node
          where node->>'id' in ('sms-policy', 'confirmation-sms')
            and node#>>'{config,recipient,path}' is distinct from
              'outputs.contactResult.contact.phone'
        )
      )
  loop
    select coalesce(max(version_number), 0) + 1
      into next_version
    from public.remodel_workflow_versions
    where workflow_id = workflow_row.workflow_id;

    upgraded_settings := jsonb_set(
      workflow_row.published_settings,
      '{failureBehavior}',
      '"continue"'::jsonb,
      true
    );
    next_published_id := gen_random_uuid();

    insert into public.remodel_workflow_versions (
      id,
      organization_id,
      workflow_id,
      version_number,
      state,
      graph,
      settings,
      layout,
      metadata,
      change_note,
      published_at
    ) values (
      next_published_id,
      workflow_row.organization_id,
      workflow_row.workflow_id,
      next_version,
      'published',
      pg_temp.use_saved_contact_phone(workflow_row.published_graph),
      upgraded_settings,
      workflow_row.published_layout,
      '{"systemUpgrade":"website-lead-sms-branch-isolation"}'::jsonb,
      'Use the matched Contact phone and continue independent lead-delivery branches',
      now()
    );

    update public.remodel_workflow_versions
    set state = 'retired'
    where id = workflow_row.published_version_id;

    update public.remodel_workflow_trigger_subscriptions
    set version_id = next_published_id
    where version_id = workflow_row.published_version_id;

    update public.remodel_workflows
    set
      published_version_id = next_published_id,
      status = 'published',
      updated_at = now()
    where id = workflow_row.workflow_id;

    if workflow_row.current_draft_version_id is not null then
      update public.remodel_workflow_versions
      set
        graph = pg_temp.use_saved_contact_phone(graph),
        settings = jsonb_set(settings, '{failureBehavior}', '"continue"'::jsonb, true),
        metadata = metadata ||
          '{"systemUpgrade":"website-lead-sms-branch-isolation"}'::jsonb,
        change_note = 'Use saved Contact phone and isolate delivery branch failures'
      where id = workflow_row.current_draft_version_id;
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;
