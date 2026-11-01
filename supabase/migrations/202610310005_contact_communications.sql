begin;

create table if not exists public.remodel_contact_communications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  channel text not null check (channel in ('email', 'sms')),
  direction text not null default 'outbound' check (direction in ('outbound')),
  status text not null default 'sent' check (status in ('sent')),
  recipient text not null check (length(recipient) between 1 and 320),
  sender text check (sender is null or length(sender) <= 320),
  subject text check (subject is null or length(subject) <= 300),
  body text not null check (length(body) between 1 and 10000),
  related_kind text check (related_kind is null or related_kind in ('lead', 'quote', 'agreement', 'client_portal')),
  related_id uuid,
  provider_id text check (provider_id is null or length(provider_id) <= 250),
  dedupe_key text not null check (length(dedupe_key) between 1 and 400),
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, contact_id)
    references public.remodel_records(organization_id, id) on delete cascade,
  unique (organization_id, dedupe_key)
);

create index if not exists remodel_contact_communications_timeline
  on public.remodel_contact_communications
  (organization_id, contact_id, sent_at desc, id desc);

alter table public.remodel_contact_communications enable row level security;
revoke all on public.remodel_contact_communications from public, anon, authenticated;
grant all on public.remodel_contact_communications to service_role;

-- Preserve the delivery evidence already stored on website leads.
insert into public.remodel_contact_communications (
  organization_id, contact_id, channel, recipient, subject, body,
  related_kind, related_id, provider_id, dedupe_key, sent_at
)
select
  lead.organization_id,
  contact.id,
  'email',
  lead.data->'websiteSubmission'->>'email',
  'We received your remodel request',
  'Website inquiry confirmation email sent.',
  'lead',
  lead.id,
  lead.data->'emailAcknowledgement'->>'googleMessageId',
  'legacy-lead-email:' || lead.id::text || ':' || coalesce(lead.data->'emailAcknowledgement'->>'googleMessageId', lead.data->'emailAcknowledgement'->>'attemptedAt'),
  (lead.data->'emailAcknowledgement'->>'attemptedAt')::timestamptz
from public.remodel_records lead
join public.remodel_records contact
  on contact.organization_id = lead.organization_id
 and contact.id::text = lead.data->>'contactId'
 and contact.kind = 'contact'
where lead.kind = 'lead'
  and lead.data->'emailAcknowledgement'->>'status' = 'sent'
  and coalesce(lead.data->'websiteSubmission'->>'email', '') <> ''
on conflict (organization_id, dedupe_key) do nothing;

insert into public.remodel_contact_communications (
  organization_id, contact_id, channel, recipient, body,
  related_kind, related_id, provider_id, dedupe_key, sent_at
)
select
  lead.organization_id,
  contact.id,
  'sms',
  lead.data->'websiteSubmission'->>'phone',
  'Website inquiry confirmation text sent.',
  'lead',
  lead.id,
  lead.data->'smsAcknowledgement'->>'twilioMessageSid',
  'legacy-lead-sms:' || lead.id::text || ':' || coalesce(lead.data->'smsAcknowledgement'->>'twilioMessageSid', lead.data->'smsAcknowledgement'->>'attemptedAt'),
  (lead.data->'smsAcknowledgement'->>'attemptedAt')::timestamptz
from public.remodel_records lead
join public.remodel_records contact
  on contact.organization_id = lead.organization_id
 and contact.id::text = lead.data->>'contactId'
 and contact.kind = 'contact'
where lead.kind = 'lead'
  and lead.data->'smsAcknowledgement'->>'status' = 'sent'
  and coalesce(lead.data->'websiteSubmission'->>'phone', '') <> ''
on conflict (organization_id, dedupe_key) do nothing;

-- Quote send attempts contain one row per accepted Gmail message, including resends.
insert into public.remodel_contact_communications (
  organization_id, contact_id, channel, recipient, subject, body,
  related_kind, related_id, provider_id, dedupe_key, sent_at
)
select
  send.organization_id,
  contact.id,
  'email',
  send.recipient_email,
  'Quote sent',
  'Quote email sent with the PDF and private client link.',
  'quote',
  send.quote_id,
  send.google_message_id,
  'legacy-quote-email:' || send.request_id::text,
  coalesce(send.completed_at, send.created_at)
from public.remodel_quote_email_sends send
join public.remodel_records quote
  on quote.organization_id = send.organization_id
 and quote.id = send.quote_id
 and quote.kind in ('quote', 'project')
join lateral (
  select candidate.id
  from public.remodel_records candidate
  where candidate.organization_id = send.organization_id
    and candidate.kind = 'contact'
    and (
      candidate.id::text = quote.data->>'contactId'
      or lower(candidate.data->>'email') = lower(send.recipient_email)
    )
  order by (candidate.id::text = quote.data->>'contactId') desc
  limit 1
) contact on true
where send.state = 'sent'
on conflict (organization_id, dedupe_key) do nothing;

insert into public.remodel_contact_communications (
  organization_id, contact_id, channel, recipient, subject, body,
  related_kind, related_id, provider_id, dedupe_key, sent_at
)
select
  record.organization_id,
  contact.id,
  'email',
  record.data->'msaAgreement'->>'ownerEmail',
  'Premium Remodel Master Services Agreement',
  'Master Services Agreement review and signing link sent.',
  'agreement',
  record.id,
  record.data->'msaAgreement'->>'sendMessageId',
  'legacy-msa-email:' || record.id::text || ':' || (record.data->'msaAgreement'->>'sendMessageId'),
  (record.data->'msaAgreement'->>'sentAt')::timestamptz
from public.remodel_records record
join lateral (
  select candidate.id
  from public.remodel_records candidate
  where candidate.organization_id = record.organization_id
    and candidate.kind = 'contact'
    and (
      candidate.id::text = record.data->>'contactId'
      or lower(candidate.data->>'email') = lower(record.data->'msaAgreement'->>'ownerEmail')
    )
  order by (candidate.id::text = record.data->>'contactId') desc
  limit 1
) contact on true
where record.kind in ('quote', 'project')
  and record.data->'msaAgreement'->>'status' in ('sent', 'signed')
  and coalesce(record.data->'msaAgreement'->>'sendMessageId', '') <> ''
  and coalesce(record.data->'msaAgreement'->>'sentAt', '') <> ''
on conflict (organization_id, dedupe_key) do nothing;

notify pgrst, 'reload schema';
commit;
