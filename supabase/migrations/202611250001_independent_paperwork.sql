begin;
alter table public.remodel_agreement_templates add column if not exists paperwork jsonb not null default '{}'::jsonb;
alter table public.remodel_agreement_template_versions add column if not exists paperwork jsonb not null default '{}'::jsonb;
alter table public.remodel_agreement_packets add column if not exists quote_id uuid;
alter table public.remodel_agreement_packets add column if not exists revision integer not null default 1;
alter table public.remodel_agreement_packets add column if not exists assignment_key text;
create unique index if not exists remodel_paperwork_assignment_once on public.remodel_agreement_packets(organization_id,assignment_key) where assignment_key is not null and status<>'void';
create index if not exists remodel_paperwork_quote on public.remodel_agreement_packets(organization_id, quote_id, created_at desc);
alter table public.remodel_agreement_signers drop constraint if exists remodel_agreement_signers_email_check;
alter table public.remodel_agreement_signers add constraint remodel_agreement_signers_email_check check (email = '' or length(trim(email)) between 3 and 320);
create or replace function public.remodel_publish_agreement_template(
  p_organization_id uuid,
  p_template_id uuid,
  p_expected_revision integer,
  p_published_by uuid,
  p_change_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  template_row public.remodel_agreement_templates%rowtype;
  next_version integer;
begin
  select * into template_row
  from public.remodel_agreement_templates
  where organization_id = p_organization_id
    and id = p_template_id
  for update;

  if not found then
    raise exception 'agreement_template_not_found';
  end if;
  if template_row.revision <> p_expected_revision then
    raise exception 'agreement_revision_conflict';
  end if;
  if template_row.status = 'archived' then
    raise exception 'agreement_template_archived';
  end if;

  next_version := template_row.current_version + 1;
  insert into public.remodel_agreement_template_versions (
    organization_id, template_id, version, name, description, source_type,
    content, fields, signer_roles, storage_path, original_filename, mime_type,
    file_sha256, page_count, paperwork, change_note, published_by
  ) values (
    template_row.organization_id, template_row.id, next_version,
    template_row.name, template_row.description, template_row.source_type,
    template_row.content, template_row.fields, template_row.signer_roles,
    template_row.storage_path, template_row.original_filename,
    template_row.mime_type, template_row.file_sha256, template_row.page_count,
    template_row.paperwork, left(coalesce(p_change_note, ''), 500), p_published_by
  );

  update public.remodel_agreement_templates
  set status = 'published',
      current_version = next_version,
      published_version = next_version,
      revision = revision + 1,
      updated_by = p_published_by,
      updated_at = now(),
      archived_at = null
  where organization_id = p_organization_id and id = p_template_id;

  return jsonb_build_object(
    'templateId', p_template_id,
    'version', next_version
  );
end;
$$;

revoke all on function public.remodel_publish_agreement_template(
  uuid, uuid, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.remodel_publish_agreement_template(
  uuid, uuid, integer, uuid, text
) to service_role;


-- One transaction persists the frozen document, recipients and initial values.
create or replace function public.remodel_create_paperwork(p_org uuid, p_actor uuid, p_document jsonb, p_recipients jsonb, p_values jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare doc_id uuid := (p_document->>'id')::uuid; recipient jsonb; entry jsonb;
begin
  insert into remodel_agreement_packets(id,organization_id,template_id,template_version,quote_id,project_id,contact_id,template_snapshot,data_snapshot,created_by,assignment_key)
  values(doc_id,p_org,(p_document->>'templateId')::uuid,(p_document->>'templateVersion')::integer,(p_document->>'quoteId')::uuid,(p_document->>'projectId')::uuid,(p_document->>'contactId')::uuid,p_document->'templateSnapshot',p_document->'dataSnapshot',p_actor,p_document->>'assignmentKey');
  for recipient in select * from jsonb_array_elements(p_recipients) loop
    insert into remodel_agreement_signers(id,organization_id,packet_id,role_id,role_label,party_type,signing_order,name,email)
    values((recipient->>'id')::uuid,p_org,doc_id,recipient->>'roleId',recipient->>'label',recipient->>'partyType',(recipient->>'order')::integer,recipient->>'name',coalesce(recipient->>'email',''));
  end loop;
  for entry in select * from jsonb_array_elements(p_values) loop
    insert into remodel_agreement_field_values(organization_id,packet_id,field_id,value) values(p_org,doc_id,entry->>'id',entry->'value');
  end loop;
  return doc_id;
end $$;
revoke all on function public.remodel_create_paperwork(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.remodel_create_paperwork(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

-- Explicit creation only. Keep the quote and protect against duplicate clicks.
create or replace function public.remodel_create_project_from_quote(p_org uuid,p_quote uuid,p_actor uuid,p_version text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.remodel_records%rowtype; proj jsonb; new_project_id uuid; row_item public.remodel_records%rowtype; new_id uuid; stamp text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 select * into q from remodel_records where organization_id=p_org and id=p_quote and kind='quote' for update;
 if not found then raise exception 'quote_not_found'; end if;
 if q.data->>'linkedProjectId' is not null then
   select data into proj from remodel_records where organization_id=p_org and id=(q.data->>'linkedProjectId')::uuid and kind='project';
   if proj is null then raise exception 'linked_project_missing'; end if;
   return proj;
 end if;
 if q.data->>'updatedAt' <> p_version then raise exception 'quote_changed'; end if;
 if not exists(select 1 from remodel_records where organization_id=p_org and kind='scope' and project_id=p_quote) then raise exception 'quote_scope_missing'; end if;
 new_project_id := gen_random_uuid();
 proj := (q.data - 'linkedProjectId') || jsonb_build_object('id',new_project_id,'sourceQuoteId',p_quote,'status','Planning','createdAt',stamp,'updatedAt',stamp,'completedDate','');
 insert into remodel_records(id,organization_id,created_by,updated_by,kind,data,updated_at) values(new_project_id,p_org,p_actor,p_actor,'project',proj,stamp);
 for row_item in select * from remodel_records where organization_id=p_org and project_id=p_quote and kind='scope' loop
   new_id := gen_random_uuid();
   insert into remodel_records(id,organization_id,created_by,updated_by,kind,project_id,data,updated_at)
   values(new_id,p_org,p_actor,p_actor,'scope',new_project_id,row_item.data || jsonb_build_object('id',new_id,'projectId',new_project_id,'sourceQuoteItemId',row_item.id,'createdAt',stamp,'updatedAt',stamp),stamp);
 end loop;
 update remodel_records set data=data || jsonb_build_object('linkedProjectId',new_project_id,'updatedAt',stamp),updated_by=p_actor,updated_at=stamp where organization_id=p_org and id=p_quote;
 update remodel_agreement_packets set project_id=(proj->>'id')::uuid where organization_id=p_org and quote_id=p_quote;
 insert into remodel_client_links(organization_id,project_id,kind,created_by) values(p_org,new_project_id,'project',p_actor);
 return proj;
end $$;
revoke all on function public.remodel_create_project_from_quote(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.remodel_create_project_from_quote(uuid,uuid,uuid,text) to service_role;
drop function if exists public.remodel_save_paperwork_draft(uuid,uuid,integer,jsonb,jsonb);
create or replace function public.remodel_save_paperwork_draft(p_org uuid,p_id uuid,p_revision integer,p_values jsonb,p_recipients jsonb,p_snapshot jsonb,p_data jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare entry jsonb; doc public.remodel_agreement_packets%rowtype;
begin
 select * into doc from remodel_agreement_packets where organization_id=p_org and id=p_id for update;
 if not found or doc.status<>'draft' or doc.revision<>p_revision then return false; end if;
 for entry in select * from jsonb_array_elements(p_values) loop
   insert into remodel_agreement_field_values(organization_id,packet_id,field_id,value) values(p_org,p_id,entry->>'id',entry->'value')
   on conflict(organization_id,packet_id,field_id) do update set value=excluded.value;
 end loop;
 for entry in select * from jsonb_array_elements(p_recipients) loop
   update remodel_agreement_signers set name=entry->>'name',email=entry->>'email' where organization_id=p_org and packet_id=p_id and role_id=entry->>'roleId';
 end loop;
 update remodel_agreement_packets set revision=revision+1,template_snapshot=p_snapshot,data_snapshot=jsonb_set(p_data,'{documentValues}',coalesce(p_data->'documentValues','{}'::jsonb) || coalesce((select jsonb_object_agg(value->>'id',value->'value') from jsonb_array_elements(p_values)),'{}'::jsonb)) where organization_id=p_org and id=p_id;
 return true;
end $$;
revoke all on function public.remodel_save_paperwork_draft(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.remodel_save_paperwork_draft(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb) to service_role;
create or replace function public.remodel_publish_paperwork(p_org uuid,p_id uuid,p_revision integer,p_channel text,p_notify boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare doc public.remodel_agreement_packets%rowtype; previous_id uuid;
begin
 select * into doc from remodel_agreement_packets where organization_id=p_org and id=p_id for update;
 if not found or doc.status='void' or doc.revision<>p_revision then return false; end if;
 if p_channel not in ('onsite','portal') then raise exception 'invalid_paperwork_channel'; end if;
 update remodel_agreement_packets set status=case when status='draft' then 'sent' else status end,revision=revision+1,sent_at=coalesce(sent_at,now()),template_snapshot=template_snapshot || jsonb_build_object('deliveryMode',case when p_channel='onsite' then 'onsite' else 'email' end,'portalPublished',p_channel='portal' or coalesce((template_snapshot->>'portalPublished')::boolean,false),'notifyEmail',p_notify) where organization_id=p_org and id=p_id;
 previous_id := (doc.template_snapshot->>'supersedesId')::uuid;
 if previous_id is not null then
   update remodel_agreement_packets set status='void',voided_at=now() where organization_id=p_org and id=previous_id and quote_id=doc.quote_id and template_id=doc.template_id and status not in ('completed','void');
 end if;
 return true;
end $$;
revoke all on function public.remodel_publish_paperwork(uuid,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.remodel_publish_paperwork(uuid,uuid,integer,text,boolean) to service_role;
create or replace function public.remodel_sign_agreement_signer(
  p_organization_id uuid,
  p_packet_id uuid,
  p_signer_id uuid,
  p_field_values jsonb,
  p_signature_evidence jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  signer_order integer;
  changed integer;
  item jsonb;
  completed_at_value timestamptz := now();
begin
  -- Serialize signing with sharing, replacement and voiding.
  perform 1 from public.remodel_agreement_packets
  where organization_id=p_organization_id and id=p_packet_id
    and status in ('sent','in_progress') for update;
  if not found then return false; end if;
  select signing_order into signer_order
  from public.remodel_agreement_signers
  where organization_id = p_organization_id
    and packet_id = p_packet_id
    and id = p_signer_id
    and status <> 'signed'
  for update;
  if signer_order is null then return false; end if;

  if exists (
    select 1 from public.remodel_agreement_signers
    where organization_id = p_organization_id
      and packet_id = p_packet_id
      and signing_order < signer_order
      and status <> 'signed'
  ) then raise exception 'agreement_signing_order_conflict'; end if;

  if not exists (
    select 1 from public.remodel_agreement_packets
    where organization_id = p_organization_id and id = p_packet_id
      and status in ('sent', 'in_progress')
  ) then raise exception 'agreement_packet_unavailable'; end if;

  for item in select value from jsonb_array_elements(p_field_values)
  loop
    insert into public.remodel_agreement_field_values (
      organization_id, packet_id, field_id, signer_id, value, completed_at
    ) values (
      p_organization_id, p_packet_id, item->>'fieldId', p_signer_id,
      item->'value', completed_at_value
    );
  end loop;

  update public.remodel_agreement_signers
  set status = 'signed', signed_at = completed_at_value,
      signature_evidence = p_signature_evidence
  where organization_id = p_organization_id and id = p_signer_id
    and packet_id = p_packet_id and status <> 'signed';
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  update public.remodel_agreement_packets
  set status = case when exists (select 1 from public.remodel_agreement_signers where organization_id=p_organization_id and packet_id=p_packet_id and status<>'signed') then 'in_progress' else 'completed' end,
      completed_at = case when not exists (select 1 from public.remodel_agreement_signers where organization_id=p_organization_id and packet_id=p_packet_id and status<>'signed') then completed_at_value else completed_at end
  where organization_id = p_organization_id and id = p_packet_id
    and status in ('sent','in_progress');
  return true;
end
$$;
revoke all on function public.remodel_sign_agreement_signer(
  uuid, uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.remodel_sign_agreement_signer(
  uuid, uuid, uuid, jsonb, jsonb
) to service_role;
commit;
