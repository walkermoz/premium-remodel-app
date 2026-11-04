begin;

create function pg_temp.add_premium_lead_team_sms(source_graph jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when exists (
      select 1
      from jsonb_array_elements(source_graph -> 'nodes') node
      where node ->> 'id' = 'lead-alert-sms'
    ) then source_graph
    when not exists (
      select 1
      from jsonb_array_elements(source_graph -> 'nodes') node
      where node ->> 'id' = 'delivery-router'
    ) then source_graph
    else jsonb_set(
      source_graph,
      '{nodes}',
      (
        select jsonb_agg(
          case
            when node ->> 'id' = 'delivery-router' then jsonb_set(
              node,
              '{outgoing}',
              coalesce(node -> 'outgoing', '[]'::jsonb) || jsonb_build_array(
                jsonb_build_object(
                  'id', 'router-lead-alert-sms',
                  'to', 'lead-alert-sms',
                  'label', 'Send SMS',
                  'order', 3,
                  'kind', 'always'
                )
              )
            )
            else node
          end
          order by ordinal
        )
        from jsonb_array_elements(source_graph -> 'nodes')
          with ordinality as nodes(node, ordinal)
      ) || jsonb_build_array(
        jsonb_build_object(
          'id', 'lead-alert-sms',
          'type', 'action.sendDirectSms',
          'kind', 'action',
          'name', 'Send new lead SMS',
          'config', jsonb_build_object(
            'enabled', true,
            'recipients', jsonb_build_array(
              jsonb_build_object('name', 'Matt', 'phone', '+19194139782'),
              jsonb_build_object('name', 'Walker', 'phone', '+19194344860')
            ),
            'body', E'New {{event.payload.project}} lead\n{{event.payload.name}}\nPhone: {{event.payload.phone}}\nEmail: {{event.payload.email}}\nAddress: {{event.payload.address}} {{event.payload.zip}}\nOpen ServiceBuddy to follow up.',
            'missingValueBehavior', 'blank'
          ),
          'outgoing', jsonb_build_array(
            jsonb_build_object(
              'id', 'lead-alert-sms-end',
              'to', 'end-lead-alert-sms',
              'label', 'Sent',
              'order', 0
            )
          )
        ),
        jsonb_build_object(
          'id', 'end-lead-alert-sms',
          'type', 'control.end',
          'kind', 'terminal',
          'name', 'SMS path complete',
          'config', jsonb_build_object('reason', 'SMS recipients notified'),
          'outgoing', '[]'::jsonb
        )
      )
    )
  end;
$$;

create function pg_temp.add_premium_lead_team_sms_layout(source_layout jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    coalesce(source_layout, '{}'::jsonb),
    '{nodes}',
    coalesce(source_layout -> 'nodes', '{}'::jsonb) || jsonb_build_object(
      'lead-alert-sms', jsonb_build_object('x', 1320, 'y', 680),
      'end-lead-alert-sms', jsonb_build_object('x', 1320, 'y', 860)
    ),
    true
  );
$$;

do $$
declare
  workflow_row record;
  next_version bigint;
  next_published_id uuid;
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
        select 1
        from jsonb_array_elements(published.graph -> 'nodes') node
        where node ->> 'id' = 'website-form'
          and node ->> 'type' = 'trigger.websiteFormSubmitted'
      )
      and exists (
        select 1
        from jsonb_array_elements(published.graph -> 'nodes') node
        where node ->> 'id' = 'team-notification'
          and node ->> 'name' = 'Send lead to Discord'
      )
      and not exists (
        select 1
        from jsonb_array_elements(published.graph -> 'nodes') node
        where node ->> 'id' = 'lead-alert-sms'
      )
  loop
    select coalesce(max(version_number), 0) + 1
      into next_version
    from public.remodel_workflow_versions
    where workflow_id = workflow_row.workflow_id;

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
      pg_temp.add_premium_lead_team_sms(workflow_row.published_graph),
      workflow_row.published_settings,
      pg_temp.add_premium_lead_team_sms_layout(workflow_row.published_layout),
      '{"systemUpgrade":"premium-lead-sms-notifications"}'::jsonb,
      'Notify Matt and Walker by text when a website lead arrives',
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
        graph = pg_temp.add_premium_lead_team_sms(graph),
        layout = pg_temp.add_premium_lead_team_sms_layout(layout),
        metadata = metadata ||
          '{"systemUpgrade":"premium-lead-sms-notifications"}'::jsonb,
        change_note = 'Added new lead SMS notifications'
      where id = workflow_row.current_draft_version_id;
    end if;
  end loop;
end
$$;

commit;
