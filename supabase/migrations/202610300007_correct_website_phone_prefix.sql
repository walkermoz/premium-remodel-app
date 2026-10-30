begin;

-- Earlier versions of the website prepended +1 even when the visitor entered
-- a +1 number. Repair only contacts with that exact 12-digit US pattern and a
-- website source; the record audit trigger retains the original value.
with affected as materialized (
  select id,
    to_char(clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as changed_at
  from public.remodel_records
  where kind = 'contact'
    and data->>'source' in ('Premium Remodel website', 'Website form')
    and data->>'phone' ~ '^\+11[0-9]{10}$'
)
update public.remodel_records as contact
set data = jsonb_set(
      jsonb_set(contact.data, '{phone}',
        to_jsonb(concat('+', substring(contact.data->>'phone' from 3))), true),
      '{updatedAt}', to_jsonb(affected.changed_at), true),
    updated_at = affected.changed_at
from affected
where contact.id = affected.id;

commit;
