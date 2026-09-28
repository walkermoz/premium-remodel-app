begin;

-- Admin-scoped API keys for ServiceBuddy / Dispatch integrations.
create table if not exists public.remodel_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  key_prefix text not null check (length(key_prefix) between 8 and 16),
  key_hash text not null unique check (length(key_hash) = 64),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists remodel_api_keys_org_active
  on public.remodel_api_keys (organization_id, created_at desc)
  where revoked_at is null;

alter table public.remodel_api_keys enable row level security;
revoke all on public.remodel_api_keys from public, anon, authenticated;
grant all on public.remodel_api_keys to service_role;

-- Lead event webhook URL for Dispatch (<~1 min wake).
alter table public.remodel_settings
  add column if not exists lead_webhook_url text
    check (
      lead_webhook_url is null
      or (
        length(lead_webhook_url) between 12 and 500
        and lead_webhook_url ~ '^https://'
      )
    );

alter table public.remodel_settings
  add column if not exists lead_webhook_secret text
    check (
      lead_webhook_secret is null
      or length(lead_webhook_secret) between 8 and 200
    );

-- Default new website leads into the Active funnel disposition.
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
      'disposition', 'Active',
      'approvalState', 'none',
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
