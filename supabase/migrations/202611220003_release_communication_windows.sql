-- Release only automatic message-window holds. Explicit Wait nodes retain
-- their dates, durations and conditions. The worker resumes these next cycle.
update public.remodel_workflow_waits as w
set wake_at = now()
from public.remodel_workflow_runs as r
join public.remodel_workflow_versions as v
  on v.id = r.version_id and v.organization_id = r.organization_id
where w.run_id = r.id
  and w.organization_id = r.organization_id
  and w.status = 'waiting'
  and w.mode = 'timestamp'
  and w.wake_at > now()
  and exists (
    select 1 from jsonb_array_elements(v.graph->'nodes') as node
    where node->>'id' = w.node_id
      and node->>'type' in (
        'action.sendEmail', 'action.sendSms',
        'action.sendDirectSms', 'action.internalNotification'
      )
  );
