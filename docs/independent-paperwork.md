# Independent quote paperwork

Quotes use two sections: **Quote & pricing** and **Paperwork**. Sending a quote PDF does not require an agreement, signature, deposit, or project. Marking a quote Accepted records staff approval separately from customer signature evidence. **Create project** is an explicit, idempotent action that retains the quote and creates a linked project with copied scope. Receiving a payment never creates a project.

## Configure once, use on a quote

In Settings → Business → Paperwork templates, create an authored document or upload a PDF, configure fields and recipients, enable its Paperwork options, and publish it. Only published, enabled templates applicable to quotes appear in Add paperwork. The historical Premium Remodel MSA remains protected and is not automatically enabled as new paperwork.

Each template controls customer or staff audience, signature/form/view completion, in-person and customer portal availability, optional email notification, and optional draft assignment when a quote is accepted or a project is created. Automatic assignment prepares drafts; it does not send messages or sign anything.

Quote, customer, business and staff bindings use the allowlist in `lib/paperwork-schema.ts`. Authored text supports `{{contact.name}}` and the other listed variables. Bindings resolve on the server and are frozen with the published template version. Internal costs and arbitrary expression evaluation are excluded.

## Use paperwork

1. Add configured paperwork, choose recipients, and enter staff-prepared fields.
2. Preview or download its PDF. Edit the draft as needed; refreshing quote values is an explicit choice.
3. Complete in person without requiring an email address, or publish to the customer's portal. Email is offered only when configured and requested. A failed email does not roll back portal publication or a saved signature.
4. Completed records retain their template, values, completion evidence and document hash. Prepare a revised copy for changes. Sharing a revised copy retires the earlier unfinished request; completed copies stay in history.

Staff forms are visible only to authorized staff, including the exact assigned staff email on their dashboard. Customer portal documents are scoped to the authorized quote/project and matching customer recipient. A customer cannot obtain another recipient's in-person handoff link. Existing prepared quote/MSA documents retain their original signing and private PDF routes.

## Release and local review

Apply `supabase/migrations/202611250001_independent_paperwork.sql` before releasing the new server. It extends the existing template/packet tables and adds service-role-only transactional functions for draft creation, editing, publication and explicit project creation. Signing serializes against replacement and voiding, and completes the packet in the same transaction as the final recipient.

The review environment uses a separate local Supabase stack and sample organization. Production data, auth accounts, messages and deployment are unchanged. The hosted PR preview requires this migration on an isolated preview database before its new paperwork operations can be reviewed there. Existing customer pages gracefully omit new paperwork if that column is not installed yet.

Regression coverage includes template visibility, allowlisted variables, draft editing and explicit refresh, in-person signature without email, customer form completion without signature, revision retirement, staff assignments, notification failure, tenant/origin/version checks, independent Accepted status, idempotent project creation, original portal links, legacy quote/MSA signing, private PDF preview and mobile layout.
