begin;

-- Older active Premium Remodel instances already keep company signing inside
-- agreement_details. Normalize their frozen presentation label without
-- changing stage order, responses, or completion state.
update public.remodel_quote_flow_instances instance
set definition_snapshot = jsonb_set(
      jsonb_set(
        instance.definition_snapshot,
        '{stages,1,title}',
        to_jsonb('Documents'::text)
      ),
      '{stages,1,description}',
      to_jsonb('Agreement details and company signatures'::text)
    ),
    updated_at = now()
from public.remodel_quote_flow_templates template,
     public.organizations organization
where instance.organization_id = template.organization_id
  and instance.template_id = template.id
  and organization.id = instance.organization_id
  and template.template_key = 'premium_remodel_quote_to_project'
  and lower(trim(organization.name)) = 'premium remodel'
  and instance.status = 'active'
  and instance.definition_snapshot #>> '{stages,1,id}' = 'agreement_details'
  and instance.definition_snapshot #>> '{stages,1,title}' <> 'Documents'
  and exists (
    select 1
    from jsonb_array_elements(
      instance.definition_snapshot #> '{stages,1,blocks}'
    ) block
    where block ->> 'bindingKey' = 'agreement.staff_signature'
  );

commit;
