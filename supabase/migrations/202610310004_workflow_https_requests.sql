begin;

do $$
declare
  workflow_row record;
  next_version bigint;
  next_published_id uuid;
  upgraded_graph jsonb;
  discord_body text := $request$
{
  "username": "Premium Remodel Bot",
  "allowed_mentions": { "parse": [] },
  "embeds": [
    {
      "title": "🔔 New Lead - Premium Living Home Improvement",
      "description": "🔥 New inbound lead ready for follow-up\n\n**Name**\n{{event.payload.name}}\n\n**Email**\n{{event.payload.email}}\n\n**Phone**\n{{event.payload.phone}}\n\n**Address**\n{{event.payload.address}}, {{event.payload.zip}}\n\n**Project**\n{{event.payload.project}}\n\n**Project description**\n{{event.payload.description}}",
      "color": 3066993,
      "footer": { "text": "Premium Remodel Lead Intake" },
      "timestamp": "{{event.occurredAt}}"
    }
  ]
}
$request$;
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
        where node ->> 'id' = 'team-notification'
          and node ->> 'type' = 'action.internalNotification'
          and node #>> '{config,templateKey}' = 'website-lead-team-notification'
      )
  loop
    select jsonb_set(
      workflow_row.published_graph,
      '{nodes}',
      jsonb_agg(
        case
          when node ->> 'id' = 'team-notification'
            and node ->> 'type' = 'action.internalNotification'
            and node #>> '{config,templateKey}' = 'website-lead-team-notification'
          then node || jsonb_build_object(
            'type', 'action.webhook',
            'name', 'Send lead to Discord',
            'config', jsonb_build_object(
              'enabled', coalesce((node #>> '{config,enabled}')::boolean, true),
              'destination', 'discord_lead_webhook',
              'method', 'POST',
              'url', '',
              'headers', '{}'::jsonb,
              'bodyType', 'json',
              'body', discord_body,
              'missingValueBehavior', 'fallback',
              'fallbackValue', 'Not provided',
              'timeoutSeconds', 15,
              'saveResponse', false,
              'templateKey', 'website-lead-team-notification'
            )
          )
          else node
        end
        order by ordinal
      )
    )
    into upgraded_graph
    from jsonb_array_elements(workflow_row.published_graph -> 'nodes')
      with ordinality as nodes(node, ordinal);

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
      upgraded_graph,
      workflow_row.published_settings,
      workflow_row.published_layout,
      '{"systemUpgrade":"https-request-actions"}'::jsonb,
      'Expose the Discord lead delivery as a configurable HTTPS request',
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
      update public.remodel_workflow_versions draft
      set graph = jsonb_set(
        draft.graph,
        '{nodes}',
        (
          select jsonb_agg(
            case
              when node ->> 'id' = 'team-notification'
                and node ->> 'type' = 'action.internalNotification'
                and node #>> '{config,templateKey}' = 'website-lead-team-notification'
              then node || jsonb_build_object(
                'type', 'action.webhook',
                'name', 'Send lead to Discord',
                'config', jsonb_build_object(
                  'enabled', coalesce((node #>> '{config,enabled}')::boolean, true),
                  'destination', 'discord_lead_webhook',
                  'method', 'POST',
                  'url', '',
                  'headers', '{}'::jsonb,
                  'bodyType', 'json',
                  'body', discord_body,
                  'missingValueBehavior', 'fallback',
                  'fallbackValue', 'Not provided',
                  'timeoutSeconds', 15,
                  'saveResponse', false,
                  'templateKey', 'website-lead-team-notification'
                )
              )
              else node
            end
            order by ordinal
          )
          from jsonb_array_elements(draft.graph -> 'nodes')
            with ordinality as nodes(node, ordinal)
        )
      ),
      metadata = draft.metadata || '{"systemUpgrade":"https-request-actions"}'::jsonb
      where draft.id = workflow_row.current_draft_version_id;
    end if;
  end loop;
end
$$;

commit;
