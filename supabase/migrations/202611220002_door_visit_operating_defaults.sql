begin;
-- Keep the original optional arguments compatible while adding validated defaults.
drop function public.remodel_create_door_visit(
  uuid,uuid,text,double precision,double precision,timestamptz,text,text,
  text,text,text,text,text,text,text,text,text,text,text
);

create or replace function public.remodel_create_door_visit(
  p_organization uuid,
  p_actor uuid,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_visited_at timestamptz,
  p_outcome text,
  p_notes text,
  p_first_name text default null,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_zip text default null,
  p_project text default null,
  p_project_description text default null,
  p_quote_date text default null,
  p_quote_start_time text default null,
  p_quote_end_time text default null,
  p_quote_notes text default null,
  p_contact_defaults jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit uuid := gen_random_uuid();
  v_contact uuid;
  v_lead uuid;
  v_now text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_actor_name text;
  v_name text;
  v_visit_data jsonb;
  v_contact_data jsonb;
  v_lead_data jsonb;
begin
  select p.full_name into v_actor_name
  from public.profiles p
  join public.remodel_memberships m on m.profile_id = p.id
  where p.id = p_actor
    and m.organization_id = p_organization
    and p.active = true and m.active = true
    and m.role in ('owner','admin','office','crew','field','doorknocker');
  if v_actor_name is null then raise exception 'Active workspace member required'; end if;

  if nullif(trim(coalesce(p_first_name, '')), '') is not null then
    v_contact := gen_random_uuid();
    v_lead := gen_random_uuid();
    v_name := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

    -- Defaults are validated by the server before this service-role-only RPC.
    -- Keep contact + lead + visit atomic; required office fields cannot lose intake.
    v_contact_data := jsonb_build_object(
      'customValues', coalesce(p_contact_defaults->'customValues', '{}'::jsonb),
      'publicCustomFields', coalesce(p_contact_defaults->'publicCustomFields', '[]'::jsonb)
    ) || jsonb_build_object(
      'id', v_contact::text,
      'firstName', coalesce(p_first_name, ''),
      'lastName', coalesce(p_last_name, ''),
      'name', v_name,
      'email', coalesce(p_email, ''),
      'phone', coalesce(p_phone, ''),
      'zip', coalesce(p_zip, ''),
      'address', p_address,
      'source', 'Door knocking',
      'createdAt', v_now,
      'updatedAt', v_now
    );
    insert into public.remodel_records (
      id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
    ) values (
      v_contact, p_organization, p_actor, p_actor, 'contact', null, v_contact_data, v_now
    );

    v_lead_data := jsonb_strip_nulls(jsonb_build_object(
      'id', v_lead::text,
      'contactId', v_contact::text,
      'name', v_name,
      'project', p_project,
      'projectDescription', p_project_description,
      'status', 'New',
      'source', 'Door knocking',
      'submittedAt', v_now,
      'quoteDate', nullif(p_quote_date, ''),
      'quoteStartTime', nullif(p_quote_start_time, ''),
      'quoteEndTime', nullif(p_quote_end_time, ''),
      'quoteNotes', nullif(p_quote_notes, ''),
      'canvasserId', p_actor::text,
      'canvasserName', v_actor_name,
      'createdAt', v_now,
      'updatedAt', v_now
    ));
    insert into public.remodel_records (
      id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
    ) values (
      v_lead, p_organization, p_actor, p_actor, 'lead', null, v_lead_data, v_now
    );
  end if;

  v_visit_data := jsonb_strip_nulls(jsonb_build_object(
    'id', v_visit::text,
    'name', p_address,
    'address', p_address,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'visitedAt', to_char(p_visited_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'outcome', p_outcome,
    'notes', coalesce(p_notes, ''),
    'canvasserId', p_actor::text,
    'canvasserName', v_actor_name,
    'leadId', case when v_lead is null then null else v_lead::text end,
    'createdAt', v_now,
    'updatedAt', v_now
  ));
  insert into public.remodel_records (
    id, organization_id, created_by, updated_by, kind, project_id, data, updated_at
  ) values (
    v_visit, p_organization, p_actor, p_actor, 'door_visit', null, v_visit_data, v_now
  );

  return jsonb_build_object(
    'visit', v_visit_data,
    'contact', v_contact_data,
    'lead', v_lead_data
  );
end;
$$;

revoke all on function public.remodel_create_door_visit(
  uuid,uuid,text,double precision,double precision,timestamptz,text,text,
  text,text,text,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.remodel_create_door_visit(
  uuid,uuid,text,double precision,double precision,timestamptz,text,text,
  text,text,text,text,text,text,text,text,text,text,text,jsonb
) to service_role;

notify pgrst, 'reload schema';
commit;
