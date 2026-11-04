begin;

-- Premium Remodel reviews agreement details and adds the company signature in
-- one Documents stage. Other organizations and their editable flow templates
-- are intentionally left unchanged.
do $$
declare
  template_row record;
  merged_stage jsonb;
  next_definition jsonb;
begin
  for template_row in
    select template.id, template.organization_id, template.revision,
           template.definition
    from public.remodel_quote_flow_templates template
    join public.organizations organization
      on organization.id = template.organization_id
    where template.template_key = 'premium_remodel_quote_to_project'
      and lower(trim(organization.name)) = 'premium remodel'
      and jsonb_array_length(template.definition -> 'stages') = 6
      and template.definition #>> '{stages,1,id}' = 'agreement_details'
      and template.definition #>> '{stages,2,id}' = 'company_approval'
  loop
    merged_stage := jsonb_set(
      jsonb_set(
        jsonb_set(
          template_row.definition #> '{stages,1}',
          '{title}',
          to_jsonb('Documents'::text)
        ),
        '{description}',
        to_jsonb('Agreement details and company signatures'::text)
      ),
      '{blocks}',
      (template_row.definition #> '{stages,1,blocks}') ||
        (template_row.definition #> '{stages,2,blocks}')
    );

    next_definition := jsonb_build_object(
      'schemaVersion', coalesce(
        template_row.definition -> 'schemaVersion',
        '1'::jsonb
      ),
      'stages', jsonb_build_array(
        template_row.definition #> '{stages,0}',
        merged_stage,
        template_row.definition #> '{stages,3}',
        template_row.definition #> '{stages,4}',
        template_row.definition #> '{stages,5}'
      )
    );

    update public.remodel_quote_flow_values value
    set stage_id = 'agreement_details',
        updated_at = now()
    where value.organization_id = template_row.organization_id
      and value.stage_id = 'company_approval'
      and value.instance_id in (
        select instance.id
        from public.remodel_quote_flow_instances instance
        where instance.organization_id = template_row.organization_id
          and instance.template_id = template_row.id
          and instance.status = 'active'
          and jsonb_array_length(instance.definition_snapshot -> 'stages') = 6
          and instance.definition_snapshot #>> '{stages,2,id}' = 'company_approval'
      );

    update public.remodel_quote_flow_events event
    set stage_id = 'agreement_details'
    where event.organization_id = template_row.organization_id
      and event.stage_id = 'company_approval'
      and event.instance_id in (
        select instance.id
        from public.remodel_quote_flow_instances instance
        where instance.organization_id = template_row.organization_id
          and instance.template_id = template_row.id
          and instance.status = 'active'
          and jsonb_array_length(instance.definition_snapshot -> 'stages') = 6
          and instance.definition_snapshot #>> '{stages,2,id}' = 'company_approval'
      );

    update public.remodel_quote_flow_instances instance
    set definition_snapshot = jsonb_build_object(
          'schemaVersion', coalesce(
            instance.definition_snapshot -> 'schemaVersion',
            '1'::jsonb
          ),
          'stages', jsonb_build_array(
            instance.definition_snapshot #> '{stages,0}',
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  instance.definition_snapshot #> '{stages,1}',
                  '{title}',
                  to_jsonb('Documents'::text)
                ),
                '{description}',
                to_jsonb('Agreement details and company signatures'::text)
              ),
              '{blocks}',
              (instance.definition_snapshot #> '{stages,1,blocks}') ||
                (instance.definition_snapshot #> '{stages,2,blocks}')
            ),
            instance.definition_snapshot #> '{stages,3}',
            instance.definition_snapshot #> '{stages,4}',
            instance.definition_snapshot #> '{stages,5}'
          )
        ),
        current_stage_id = case
          when instance.current_stage_id = 'company_approval'
            then 'agreement_details'
          else instance.current_stage_id
        end,
        updated_at = now()
    where instance.organization_id = template_row.organization_id
      and instance.template_id = template_row.id
      and instance.status = 'active'
      and jsonb_array_length(instance.definition_snapshot -> 'stages') = 6
      and instance.definition_snapshot #>> '{stages,1,id}' = 'agreement_details'
      and instance.definition_snapshot #>> '{stages,2,id}' = 'company_approval';

    update public.remodel_quote_flow_templates
    set definition = next_definition,
        revision = revision + 1,
        updated_at = now()
    where organization_id = template_row.organization_id
      and id = template_row.id;

    perform public.remodel_publish_quote_flow_template(
      template_row.organization_id,
      template_row.id,
      template_row.revision + 1,
      null,
      'Combined agreement preparation and company signing into Documents.'
    );
  end loop;
end;
$$;

commit;
