begin;

-- The command bridge may already have acknowledged an operator message before
-- product signals were introduced. Preserve those authenticated messages as
-- recommendation evidence without re-executing the commands themselves.
insert into public.servicebuddy_product_signals (
  source,
  source_reference,
  submitted_by,
  body,
  status,
  created_at
)
select
  'discord',
  'discord-message:' || command.discord_message_id,
  command.discord_user_id,
  command.body,
  'new',
  command.discord_created_at
from public.servicebuddy_discord_operator_commands as command
on conflict do nothing;

commit;
