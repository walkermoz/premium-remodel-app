begin;

alter table public.remodel_records drop constraint if exists remodel_records_kind_check;
alter table public.remodel_records add constraint remodel_records_kind_check
  check (kind in (
    'project','quote','task','contractor','scope','comment','attachment',
    'activity','alert','contact','lead'
  ));

alter table public.remodel_records drop constraint if exists remodel_records_check;
alter table public.remodel_records add constraint remodel_records_check check (
  (kind in ('project','quote','contractor','alert','contact','lead') and project_id is null) or
  (kind in ('task','scope','comment','attachment','activity') and project_id is not null)
);

create or replace function public.remodel_receive_website_lead(
  p_organization uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_zip text,
  p_address text,
  p_project text,
  p_project_description text
)
returns table(contact_id uuid, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid := gen_random_uuid();
  v_lead uuid := gen_random_uuid();
  v_now text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_name text := trim(p_first_name || ' ' || p_last_name);
begin
  if not exists (select 1 from public.organizations where id = p_organization) then
    raise exception 'Organization not found';
  end if;

  insert into public.remodel_records (
    id, organization_id, kind, project_id, data, updated_at
  ) values (
    v_contact,
    p_organization,
    'contact',
    null,
    jsonb_build_object(
      'id', v_contact::text,
      'firstName', p_first_name,
      'lastName', p_last_name,
      'name', v_name,
      'email', p_email,
      'phone', p_phone,
      'zip', p_zip,
      'address', p_address,
      'source', 'Premium Remodel website',
      'createdAt', v_now,
      'updatedAt', v_now
    ),
    v_now
  );

  insert into public.remodel_records (
    id, organization_id, kind, project_id, data, updated_at
  ) values (
    v_lead,
    p_organization,
    'lead',
    null,
    jsonb_build_object(
      'id', v_lead::text,
      'contactId', v_contact::text,
      'name', v_name,
      'project', p_project,
      'projectDescription', p_project_description,
      'status', 'New',
      'source', 'Premium Remodel website',
      'submittedAt', v_now,
      'createdAt', v_now,
      'updatedAt', v_now
    ),
    v_now
  );

  return query select v_contact, v_lead;
end;
$$;

revoke all on function public.remodel_receive_website_lead(
  uuid,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.remodel_receive_website_lead(
  uuid,text,text,text,text,text,text,text,text
) to service_role;

notify pgrst, 'reload schema';
commit;
