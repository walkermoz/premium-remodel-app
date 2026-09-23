begin;
alter table public.remodel_records drop constraint if exists remodel_records_kind_check;
alter table public.remodel_records add constraint remodel_records_kind_check
  check (kind in ('project','quote','task','contractor','scope','comment','attachment','activity'));
alter table public.remodel_records drop constraint if exists remodel_records_check;
alter table public.remodel_records add constraint remodel_records_check check (
  (kind in ('project','quote','contractor') and project_id is null) or
  (kind in ('task','scope','comment','attachment','activity') and project_id is not null)
);
-- Quote acceptance changes the parent kind in place, preserving all scope and files.
notify pgrst, 'reload schema';
commit;
