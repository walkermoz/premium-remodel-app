begin;

-- The public API is the only caller. A lead, its contact, and its automation
-- history must commit together, so a successful form submission is traceable.
create or replace function public.remodel_capture_website_lead(
  p_organization_id uuid,
  p_contact jsonb,
  p_lead jsonb,
  p_match_existing boolean,
  p_steps jsonb
)
returns table(contact_id uuid, lead_id uuid, run_id uuid, contact_reused boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_lead_id uuid := (p_lead->>'id')::uuid;
  v_run_id uuid;
  v_reused boolean := false;
  v_email text := lower(coalesce(p_contact->>'email', ''));
  v_phone text := coalesce(p_contact->>'phone', '');
  v_lock text;
  v_lead jsonb;
  v_steps jsonb;
begin
  if jsonb_typeof(p_contact) <> 'object'
     or jsonb_typeof(p_lead) <> 'object'
     or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) < 2
     or not exists (select 1 from public.organizations where id = p_organization_id)
  then
    raise exception 'Invalid website lead capture';
  end if;

  if p_match_existing then
    -- Serialize matching submissions for the same email or phone. Without this,
    -- two simultaneous leads can each create a separate contact.
    for v_lock in
      select key from (
        select p_organization_id::text || ':email:' || v_email as key where v_email <> ''
        union
        select p_organization_id::text || ':phone:' || v_phone as key where v_phone <> ''
      ) keys order by key
    loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock, 0));
    end loop;

    if v_email <> '' then
      select id into v_contact_id
      from public.remodel_records
      where organization_id = p_organization_id and kind = 'contact'
        and lower(data->>'email') = v_email
      order by updated_at desc, id desc limit 1;
    end if;
    if v_contact_id is null and v_phone <> '' then
      select id into v_contact_id
      from public.remodel_records
      where organization_id = p_organization_id and kind = 'contact'
        and data->>'phone' = v_phone
      order by updated_at desc, id desc limit 1;
    end if;
    v_reused := v_contact_id is not null;
  end if;

  if v_contact_id is null then
    v_contact_id := (p_contact->>'id')::uuid;
    insert into public.remodel_records
      (id, organization_id, kind, project_id, data, updated_at)
    values
      (v_contact_id, p_organization_id, 'contact', null,
       p_contact, p_contact->>'updatedAt');
  end if;

  v_lead := p_lead || jsonb_build_object('contactId', v_contact_id::text);
  v_steps := jsonb_set(p_steps, '{0,status}',
    to_jsonb(case when v_reused then 'reused' else 'created' end));

  insert into public.remodel_records
    (id, organization_id, kind, project_id, data, updated_at)
  values
    (v_lead_id, p_organization_id, 'lead', null,
     v_lead, v_lead->>'updatedAt');

  insert into public.remodel_automation_runs
    (organization_id, automation_key, lead_id, subject, project, status, steps)
  values
    (p_organization_id, 'website-lead-intake', v_lead_id,
     left(v_lead->>'name', 250), left(v_lead->>'project', 250),
     'running', v_steps)
  returning id into v_run_id;

  return query select v_contact_id, v_lead_id, v_run_id, v_reused;
end;
$$;

revoke all on function public.remodel_capture_website_lead(uuid,jsonb,jsonb,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.remodel_capture_website_lead(uuid,jsonb,jsonb,boolean,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
