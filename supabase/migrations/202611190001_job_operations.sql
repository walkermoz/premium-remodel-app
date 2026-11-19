begin;
-- Jobs use the existing tenant-scoped record store. A project container is
-- distinguished by data.recordType='project'; legacy records remain standalone jobs.
-- This trigger serializes dependent writes with invoice finalization/closeout.
create or replace function public.remodel_guard_job_operations()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare parent public.remodel_records; parent_id uuid; internal boolean;
begin
  if TG_OP='UPDATE' and OLD.kind='quote' and OLD.data->>'jobId' is not null and NEW.kind<>'quote' then raise exception 'Job estimates retain their identity; book work onto the job invoice'; end if;
  if TG_OP='UPDATE' and OLD.project_id is distinct from NEW.project_id then raise exception 'Record parent cannot be changed'; end if;
  if TG_OP<>'DELETE' and NEW.kind='activity' then
    select * into parent from public.remodel_records where id=NEW.project_id and organization_id=NEW.organization_id and kind='quote';
    if found and parent.data->>'bookedJobId' is not null then NEW.data:=NEW.data || jsonb_build_object('invoiceJobId',parent.data->>'bookedJobId'); end if;
  end if;
  if TG_OP='DELETE' then parent_id:=OLD.project_id; else parent_id:=NEW.project_id; end if;
  if TG_OP <> 'DELETE' and NEW.kind='project' then
    internal := coalesce(current_setting('app.job_action',true),'') = NEW.id::text;
    if TG_OP='UPDATE' and not internal then
      if OLD.data->'job' is distinct from NEW.data->'job' then raise exception 'Use the job operations endpoint to change forms or invoices'; end if;
      if coalesce(OLD.data->>'recordType','job') <> coalesce(NEW.data->>'recordType','job') or OLD.data->>'parentProjectId' is distinct from NEW.data->>'parentProjectId' then raise exception 'Job and project relationships cannot be replaced'; end if;
    end if;
    if coalesce(NEW.data->>'recordType','job') <> 'project' and NEW.data->>'status'='Completed'
      and (TG_OP='INSERT' or OLD.data->>'status' is distinct from 'Completed') and not internal then
      raise exception 'Complete the job through Closeout';
    end if;
  end if;
  if TG_OP <> 'DELETE' and NEW.kind='quote' and nullif(NEW.data->>'jobId','') is not null then
    select * into parent from public.remodel_records where id=(NEW.data->>'jobId')::uuid and organization_id=NEW.organization_id and kind='project' for update;
    if not found or coalesce(parent.data->>'recordType','job')='project' then raise exception 'Estimate job is unavailable'; end if;
    if TG_OP='UPDATE' and ((OLD.data->>'jobId' is not null and OLD.data->>'jobId' is distinct from NEW.data->>'jobId') or OLD.data->>'bookedJobId' is distinct from NEW.data->>'bookedJobId') and coalesce(current_setting('app.job_action',true),'')<>parent.id::text then raise exception 'Use estimate booking to change the job association'; end if;
    if parent.data->>'status'='Completed' then raise exception 'Reopen the job before changing an estimate'; end if;
  end if;
  if parent_id is not null then
    select * into parent from public.remodel_records where id=parent_id and organization_id=case when TG_OP='DELETE' then OLD.organization_id else NEW.organization_id end and kind in ('project','quote') for update;
    if found and parent.kind='project' and coalesce(parent.data->>'recordType','job')<>'project' then
      if parent.data->>'status'='Completed' then
        if (case when TG_OP='DELETE' then OLD.kind else NEW.kind end) in ('task','scope') then raise exception 'Reopen the job before changing work or invoice items'; end if;
      end if;
      if (case when TG_OP='DELETE' then OLD.kind else NEW.kind end)='scope' and parent.data#>>'{job,invoice,status}'='Finalized' then raise exception 'Reopen the invoice before changing its items'; end if;
    end if;
  end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
drop trigger if exists remodel_guard_job_operations on public.remodel_records;
create trigger remodel_guard_job_operations before insert or update or delete on public.remodel_records for each row execute function public.remodel_guard_job_operations();

create or replace function public.remodel_save_job_operation(target_organization uuid,target_actor uuid,target_job uuid,expected_version timestamptz,next_data jsonb,completing boolean default false,estimate_id uuid default null,estimate_version timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job_row public.remodel_records; estimate public.remodel_records; item public.remodel_records; item_id uuid; now_at timestamptz; updated_estimate jsonb; total numeric; paid numeric; billable jsonb; authorization_document jsonb; invoice_document jsonb;
begin
  select * into job_row from public.remodel_records where id=target_job and organization_id=target_organization and kind='project' for update;
  if not found or coalesce(job_row.data->>'recordType','job')='project' then raise exception 'Job unavailable'; end if;
  if job_row.updated_at<>expected_version then raise exception 'The job changed. Refresh before continuing'; end if;
  if next_data->>'id'<>target_job::text or next_data->>'recordType' is distinct from job_row.data->>'recordType' or next_data->>'parentProjectId' is distinct from job_row.data->>'parentProjectId' then raise exception 'Job identity cannot change'; end if;
  if job_row.data->>'status'='Completed' then raise exception 'Reopen the job before making changes'; end if;
  perform set_config('app.job_action',target_job::text,true);
  now_at:=greatest(clock_timestamp(),job_row.updated_at+interval '1 millisecond');
  if completing then
    if next_data->>'status'<>'Completed' or next_data#>>'{job,invoice,status}'<>'Finalized' or nullif(next_data#>>'{job,invoice,summary}','') is null or next_data#>'{job,invoice,acknowledgement}' is null then raise exception 'Finalize and acknowledge the invoice first'; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(next_data#>'{job,forms}','[]')) f where (f->>'required')::boolean and f->>'status'<>'Complete') then raise exception 'Complete required forms'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(next_data#>'{job,appointments}','[]')) a where a->>'status'='Done') or exists(select 1 from jsonb_array_elements(coalesce(next_data#>'{job,appointments}','[]')) a where a->>'status' not in ('Done','Canceled')) or exists(select 1 from public.remodel_records where organization_id=target_organization and project_id=target_job and kind='task' and data->>'status'<>'Done') then raise exception 'Finish remaining appointments and work'; end if;
    if exists(select 1 from public.remodel_records q where q.organization_id=target_organization and q.kind='quote' and q.data->>'jobId'=target_job::text and q.data->>'junkedAt' is null and q.data->>'bookedJobId' is null and not exists(select 1 from public.remodel_records i where i.organization_id=target_organization and i.project_id=q.id and i.kind in ('scope','attachment'))) then raise exception 'Remove or finish empty estimates'; end if;
    if exists(select 1 from public.remodel_records where organization_id=target_organization and kind='quote' and data->>'jobId'=target_job::text and data->>'status'='Accepted' and nullif(data->>'bookedJobId','') is null) then raise exception 'Book the sold estimates first'; end if;
    select coalesce(sum((data->>'estimate')::numeric),0) into total from public.remodel_records where organization_id=target_organization and project_id=target_job and kind='scope';
    select coalesce(sum((data->>'amount')::numeric),0) into paid from public.remodel_records where organization_id=target_organization and kind='activity' and (project_id=target_job or data->>'invoiceJobId'=target_job::text) and data->>'activityType'='Payment received';
    select coalesce(jsonb_agg(jsonb_build_object('id',data->>'id','title',data->>'title','details',coalesce(data->>'details',''),'amount',(data->>'estimate')::numeric,'customerVisible',coalesce((data->>'customerVisible')::boolean,true)) order by data->>'id'),'[]'::jsonb) into billable from public.remodel_records where organization_id=target_organization and project_id=target_job and kind='scope';
    authorization_document:=jsonb_build_object('id',target_job,'customer',next_data->>'client','address',next_data->>'address','items',billable);
    if total>0 and (next_data#>>'{job,invoice,authorization,document}' is null or (next_data#>>'{job,invoice,authorization,document}')::jsonb<>authorization_document) then raise exception 'Collect customer work authorization for the current invoice items'; end if;
    invoice_document:=jsonb_build_object('id',target_job,'customer',next_data->>'client','address',next_data->>'address','items',billable,'invoice',jsonb_strip_nulls(jsonb_build_object('summary',next_data#>>'{job,invoice,summary}','status',next_data#>>'{job,invoice,status}','paymentTerms',next_data#>>'{job,invoice,paymentTerms}','paymentNotes',next_data#>>'{job,invoice,paymentNotes}','finalizedAt',next_data#>>'{job,invoice,finalizedAt}','authorization',next_data#>'{job,invoice,authorization}')));
    if next_data#>>'{job,invoice,acknowledgement,document}' is null or (next_data#>>'{job,invoice,acknowledgement,document}')::jsonb<>invoice_document then raise exception 'Collect acknowledgement for the current invoice'; end if;
    if total>paid and (next_data#>>'{job,invoice,paymentTerms}'<>'On account' or nullif(btrim(next_data#>>'{job,invoice,paymentNotes}'),'') is null) then raise exception 'Collect payment or document account terms'; end if;
  elsif next_data->>'status' is distinct from job_row.data->>'status' then raise exception 'Status changes must use the job workflow';
  end if;
  if estimate_id is not null then
    select * into estimate from public.remodel_records where id=estimate_id and organization_id=target_organization and kind='quote' for update;
    if not found or estimate.data->>'jobId'<>target_job::text then raise exception 'Estimate changed or is unavailable'; end if;
    if estimate.data->>'bookedJobId'=target_job::text then return job_row.data; end if;
    if estimate.updated_at<>estimate_version then raise exception 'Estimate changed or is unavailable'; end if;
    if estimate.data->>'status'<>'Accepted' or estimate.data#>>'{msaAgreement,status}'<>'signed' or estimate.data->'quoteAcceptance' is null or jsonb_array_length(coalesce(estimate.data->'acceptedQuoteScope','[]'))=0 then raise exception 'Signed estimate and agreement required'; end if;
    if coalesce(job_row.data#>>'{job,invoice,status}','Draft')<>'Draft' then raise exception 'Reopen the invoice before booking'; end if;
    if (select coalesce(round(sum((data->>'estimate')::numeric)*100),0) from public.remodel_records where organization_id=target_organization and project_id=estimate_id and kind='scope') <> round((estimate.data->>'contractPrice')::numeric*100) or (select count(*) from public.remodel_records where organization_id=target_organization and project_id=estimate_id and kind='scope') <> jsonb_array_length(estimate.data->'acceptedQuoteScope') then raise exception 'Stored estimate scope differs from signed scope'; end if;
    for item in select * from public.remodel_records where organization_id=target_organization and project_id=estimate_id and kind='scope' order by id loop
      item_id:=gen_random_uuid();
      insert into public.remodel_records(id,organization_id,kind,project_id,created_by,updated_by,updated_at,data)
      values(item_id,target_organization,'scope',target_job,target_actor,target_actor,now_at,item.data || jsonb_build_object('id',item_id,'projectId',target_job,'createdAt',now_at,'updatedAt',now_at,'sourceEstimateId',estimate_id));
    end loop;
    updated_estimate:=estimate.data || jsonb_build_object('bookedJobId',target_job,'updatedAt',now_at);
    update public.remodel_records set data=updated_estimate,updated_at=now_at,updated_by=target_actor where id=estimate_id and organization_id=target_organization;
    update public.remodel_records set data=data || jsonb_build_object('invoiceJobId',target_job),updated_by=target_actor where organization_id=target_organization and project_id=estimate_id and kind='activity' and data->>'activityType'='Payment received';
  end if;
  next_data:=next_data || jsonb_build_object('updatedAt',now_at);
  update public.remodel_records set data=next_data,updated_at=now_at,updated_by=target_actor where id=target_job and organization_id=target_organization;
  return next_data;
end $$;
revoke all on function public.remodel_save_job_operation(uuid,uuid,uuid,timestamptz,jsonb,boolean,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.remodel_save_job_operation(uuid,uuid,uuid,timestamptz,jsonb,boolean,uuid,timestamptz) to service_role;
commit;
