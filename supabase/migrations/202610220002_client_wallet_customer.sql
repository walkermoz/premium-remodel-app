begin;

alter table public.remodel_client_links
  add column if not exists stripe_customer_id text;

notify pgrst, 'reload schema';
commit;
