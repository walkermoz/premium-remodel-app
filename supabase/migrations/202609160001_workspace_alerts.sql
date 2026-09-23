begin;

alter table public.remodel_records drop constraint if exists remodel_records_kind_check;
alter table public.remodel_records add constraint remodel_records_kind_check
  check (kind in ('project','quote','task','contractor','scope','comment','attachment','activity','alert'));

alter table public.remodel_records drop constraint if exists remodel_records_check;
alter table public.remodel_records add constraint remodel_records_check check (
  (kind in ('project','quote','contractor','alert') and project_id is null) or
  (kind in ('task','scope','comment','attachment','activity') and project_id is not null)
);

-- Targeted company alerts are also enforced for direct Data API reads.
drop policy if exists remodel_company_read on public.remodel_records;
create policy remodel_company_read on public.remodel_records for select to authenticated
using (
  organization_id = (select organization_id from public.remodel_current_member())
  and case
    when kind <> 'alert' then true
    else
      coalesce((data->>'expiresAt')::timestamptz > now(), false)
      and exists (
        select 1
        from public.remodel_current_member() member
        where member.role in ('owner','admin')
          or data->'audiences' ? member.role
      )
  end
);

notify pgrst, 'reload schema';
commit;
