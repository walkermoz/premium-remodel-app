# Website lead throughput rollout

The public lead API previously waited for its workflow to execute before replying.
The website then waited for a separate GoHighLevel webhook. This change responds
after durable capture and starts follow-up work with Next's `after` hook. The
existing scheduled workflow worker recovers jobs if that immediate attempt stops.

## Coordinated deployment

1. Apply `202611150001_website_lead_delivery_outbox.sql` through the normal database migration process. This is additive; no existing captures or workflows are replaced.
2. Deploy this backend. Existing clients still own their GoHighLevel copy, so they must not receive a second server-side copy.
3. Deploy the linked website PR. It requests `POST /api/leads?background_delivery=1`, with its original body and submission ID.
4. The website skips its webhook only when the save returns `received: true` and `goHighLevelDelivery: "queued"`. Older backends ignore the query parameter; the website retains the original bounded webhook path. A missing new database RPC also uses the original capture path without promising queued delivery.

Only the configured primary organization and Premium Remodel website origins can
negotiate this integration. Portal and other organizations' leads keep their
existing behavior. The destination is fixed to the existing GoHighLevel webhook;
no caller-supplied URL is accepted.

## Guarantees and limitations

- The contact, lead, existing workflow event, and marketing-copy job commit in one PostgreSQL transaction. Failure rolls everything back; intake never acknowledges an unsaved lead.
- Existing submission-ID checks and a unique organization/lead delivery key prevent repeat jobs. Atomic claims prevent concurrent senders from executing the same job.
- SMS choices and the established GoHighLevel fields are preserved. Submission IDs and attribution remain internal. No website tags, conversion code, form appearance, or thank-you navigation change.
- Email/SMS workflows and marketing copies start independently after the response. The scheduled worker is a recovery path, not the normal delivery path; recovery can take longer than its nominal five-minute schedule.
- GoHighLevel inbound workflows do not provide a documented exactly-once guarantee. We send a stable idempotency header, but do not assume it is honored. Only explicit HTTP 429 rejections are automatically retried, with backoff and at most three attempts.
- Timeouts, network ambiguity, non-429 failures and interrupted sender leases become `needs_attention`; they are not blindly resent. Review the remote workflow history before any manual resend. The job remains stored, the worker reports failures, and operator logs include a count without customer data. A database failure when recording a result leaves the lease for the same conservative recovery.
- Delivered jobs retain status and identifiers but clear their extra payload copy. The original lead remains available in ServiceBuddy.

## Verification

`tests/website-lead-throughput.spec.ts` tests negotiation, missing-schema fallback,
capture failures, concurrent background tasks, consent payloads, slow timeouts,
rate-limit backoff and tenant boundaries. Its disposable PGlite PostgreSQL test
executes the migration, tests transaction rollback, duplicate jobs, atomic claims,
claim-token fencing, interrupted leases and public privilege restrictions. It
does not use a real Supabase project or send real emails, SMS or webhook leads.
