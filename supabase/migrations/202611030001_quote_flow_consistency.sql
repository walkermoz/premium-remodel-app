begin;

-- Publish the clearer customer-completion wording as a new Premium Remodel
-- template version. Existing quote-flow instances retain their immutable
-- definition snapshots and therefore do not change mid-process.
do $$
declare
  template_row record;
begin
  for template_row in
    select template.id, template.organization_id, template.revision
    from public.remodel_quote_flow_templates template
    join public.organizations organization
      on organization.id = template.organization_id
    where template.template_key = 'premium_remodel_quote_to_project'
      and lower(trim(organization.name)) = 'premium remodel'
      and template.definition #>> '{stages,2,id}' = 'send_and_complete'
      and template.definition #>> '{stages,2,title}' = 'Send & complete'
  loop
    update public.remodel_quote_flow_templates
    set definition = jsonb_set(
          jsonb_set(
            definition,
            '{stages,2,title}',
            to_jsonb('Customer completion'::text)
          ),
          '{stages,2,description}',
          to_jsonb('Send, sign, and collect the deposit'::text)
        ),
        revision = revision + 1,
        updated_at = now()
    where organization_id = template_row.organization_id
      and id = template_row.id;

    perform public.remodel_publish_quote_flow_template(
      template_row.organization_id,
      template_row.id,
      template_row.revision + 1,
      null,
      'Standardize customer-completion wording and shared packet terminology.'
    );
  end loop;
end;
$$;

commit;
