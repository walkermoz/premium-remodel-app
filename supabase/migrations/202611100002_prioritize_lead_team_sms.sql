begin;

create function pg_temp.prioritize_lead_team_sms(source_graph jsonb)
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
          when node->>'id' = 'delivery-router' then
            jsonb_set(
              node,
              '{outgoing}',
              (
                select jsonb_agg(
                  case
                    when edge->>'id' = 'router-lead-alert-sms' then
                      jsonb_set(edge, '{order}', '2'::jsonb, true)
                    when edge->>'id' = 'router-team' then
                      jsonb_set(edge, '{order}', '3'::jsonb, true)
                    else edge
                  end
                  order by
                    case
                      when edge->>'id' = 'router-lead-alert-sms' then 2
                      when edge->>'id' = 'router-team' then 3
                      else coalesce((edge->>'order')::integer, edge_ordinal::integer)
                    end,
                    edge_ordinal
                from jsonb_array_elements(node->'outgoing')
                  with ordinality as edges(edge, edge_ordinal)
              ),
              true
            )
          else node
        end
        order by node_ordinal
      )
      from jsonb_array_elements(source_graph->'nodes')
        with ordinality as nodes(node, node_ordinal)
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
        select 1 from jsonb_array_elements(published.graph->'nodes') node
        cross join lateral jsonb_array_elements(node->'outgoing') edge
        where node->>'id' = 'delivery-router'
          and edge->>'id' = 'router-lead-alert-sms'
          and coalesce((edge->>'order')::integer, 999) >= 3
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
      pg_temp.prioritize_lead_team_sms(workflow_row.published_graph),
      workflow_row.published_settings,
      workflow_row.published_layout,
      '{"systemUpgrade":"prioritize-lead-team-sms"}'::jsonb,
      'Send team SMS before the independent Discord notification branch',
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
        graph = pg_temp.prioritize_lead_team_sms(graph),
        metadata = metadata ||
          '{"systemUpgrade":"prioritize-lead-team-sms"}'::jsonb,
        change_note = 'Send team SMS before Discord notifications'
      where id = workflow_row.current_draft_version_id;
    end if;
  end loop;
end
$$;

commit;
