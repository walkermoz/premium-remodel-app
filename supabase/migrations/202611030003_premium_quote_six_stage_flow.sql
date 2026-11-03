begin;

-- Publish the six-stage Premium Remodel flow for new quotes. Active instances
-- keep their immutable four-stage snapshots and can finish without changing
-- underneath staff or customers.
do $$
declare
  template_row record;
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
      and jsonb_array_length(template.definition -> 'stages') = 4
      and template.definition #>> '{stages,2,id}' = 'send_and_complete'
  loop
    next_definition := jsonb_build_object(
      'schemaVersion', 1,
      'stages', jsonb_build_array(
        template_row.definition #> '{stages,0}',
        jsonb_set(
          template_row.definition #> '{stages,1}',
          '{blocks}',
          (template_row.definition #> '{stages,1,blocks}') - 3
        ),
        jsonb_build_object(
          'id', 'company_approval',
          'type', 'signature_collection',
          'title', 'Company approval',
          'description', 'Review and sign as the company representative',
          'enabled', true,
          'required', true,
          'audience', 'staff',
          'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
          'blocks', jsonb_build_array(
            jsonb_build_object(
              'id','staff_signature','type','signature',
              'label','Company representative signature','description','',
              'enabled',true,'required',true,'audience','staff',
              'bindingKey','agreement.staff_signature',
              'conditions',jsonb_build_object('mode','all','rules',jsonb_build_array()),
              'config',jsonb_build_object(
                'signerRoleId','staff','order',1,
                'methods',jsonb_build_array('onsite'),
                'renderer','legacy_premium_msa_staff_v1'
              )
            )
          )
        ),
        jsonb_set(
          jsonb_set(
            template_row.definition #> '{stages,2}',
            '{description}',
            to_jsonb('Share the packet and collect customer signatures'::text)
          ),
          '{blocks}',
          (template_row.definition #> '{stages,2,blocks}') - 3
        ),
        jsonb_build_object(
          'id', 'deposit',
          'type', 'deposit_payment',
          'title', 'Deposit',
          'description', 'Collect online or record an offline payment',
          'enabled', true,
          'required', true,
          'audience', 'both',
          'conditions', jsonb_build_object('mode', 'all', 'rules', jsonb_build_array()),
          'blocks', jsonb_build_array(
            template_row.definition #> '{stages,2,blocks,3}'
          )
        ),
        template_row.definition #> '{stages,3}'
      )
    );

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
      'Split company approval, customer completion, and deposit into distinct stages.'
    );
  end loop;
end;
$$;

commit;
