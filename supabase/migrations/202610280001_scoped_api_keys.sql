begin;

-- Preserve every existing integration's lead permissions. New keys must
-- explicitly choose their scopes in the application.
alter table public.remodel_api_keys
  add column if not exists scopes text[] not null default array[
    'leads:read',
    'leads:write:notes',
    'leads:write:status',
    'leads:write:disposition',
    'leads:write:next_action',
    'leads:write:draft_reply',
    'leads:write:approval'
  ]::text[],
  add column if not exists expires_at timestamptz;

alter table public.remodel_api_keys
  add constraint remodel_api_keys_scopes_valid check (
    cardinality(scopes) between 1 and 7
    and scopes <@ array[
      'leads:read',
      'leads:write:notes',
      'leads:write:status',
      'leads:write:disposition',
      'leads:write:next_action',
      'leads:write:draft_reply',
      'leads:write:approval'
    ]::text[]
    and 'leads:read' = any(scopes)
  );

notify pgrst, 'reload schema';
commit;
