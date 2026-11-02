# Quote & Agreement Flow Templates

## What is configurable

Each organization can own any number of draft, published, or archived quote
flow templates. A published version is immutable. Creating a quote flow instance
copies the published definition into `definition_snapshot`, so later edits never
change an active or completed quote.

The controlled registries in `lib/quote-flow-schema.ts` define the supported
stage, block, audience, and condition types. Administrators can reorder stages
and blocks, add conditions, configure visibility and required state, connect a
published agreement template, choose signing methods and order, configure a
deposit, preview all three render modes, and publish versioned definitions.
Definitions are data only; no organization-authored JavaScript is executed.
Generic quote-builder stages render their configured contact, project, pricing,
scope, notes, and media blocks in the saved order using the live ServiceBuddy
editors. Premium Remodel alone resolves its quote-builder stage through the
locked compatibility adapter so its existing screen remains unchanged.

The shared runtime in `lib/quote-flow-instances.ts` resolves conditions against
server-owned quote, contact, project, payment, signature, staff-role, and custom
response data. Customer APIs receive only the stages and blocks whose audience
and conditions currently match. Every mutation repeats organization, audience,
condition, role, and active-instance validation on the server.
Customer navigation finds the next conditional required block, highlights it,
and scrolls it into view. Generic agreement pages also provide a sticky jump to
the highlighted signing section, while on-device signing keeps that section in
the protected side panel.

## Signing and payment integrity

Generic agreements use published agreement-template snapshots, private hashed
signer tokens, ordered signer roles, positioned signature/initial fields, and an
immutable completed PDF. On-device mode comes from the server-owned agreement
packet; a query parameter cannot enable it. The database function
`remodel_sign_agreement_signer` commits signer fields and signature evidence in
one transaction.

Standalone flow signatures, initials, in-person signatures, on-behalf
signatures, and completed deposits use
`remodel_complete_quote_flow_block`. The response and append-only audit event
are committed together. Stripe refunds retain the payment audit trail and move
the step out of its paid state. Project conversion is also transactional and
records its flow event with the conversion.

## Premium Remodel compatibility

Premium Remodel is seeded with a locked, published default template that points
to the existing quote builder, Agreement Details UI, real MSA, customer portal,
deposit, and project-promotion adapters. Its wording, styling, ordering,
defaults, and behavior remain on those existing components. The template can be
duplicated to create an editable flow without changing the live compatibility
version.

## Intentionally hard-coded behavior that remains

- The legacy Premium Remodel MSA body, legal entity details, PDF renderer, and
  legacy email copy remain in the existing Premium-only compatibility modules.
  Generic organizations use versioned agreement templates instead.
- The compatibility adapter identifiers (`legacy_premium_msa_v1`,
  `premium_quote_builder_v1`, `legacy_quote_portal_v1`, and
  `premium_quote_promotion_v1`) remain controlled platform adapters. They are
  not selected automatically for another organization.
- Supported stage, block, condition, signing, and payment provider types are a
  controlled ServiceBuddy registry. Adding an entirely new executable block or
  provider still requires platform code; arranging and configuring registered
  capabilities does not.
- Stripe is the currently implemented online checkout adapter. Manual check,
  cash, bank-transfer, and other payment recording are configurable. Future
  online or financing providers plug into the existing payment-provider
  adapter.

## Local verification

- Interactive editor and staff/customer/device preview:
  `/demo/quote-flow`
- Focused flow-template tests:
  `npx playwright test tests/quote-flow-templates.spec.ts`
- Full verification:
  `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test`

The migration is intentionally not applied by local development or tests. Apply
`supabase/migrations/202611020001_quote_agreement_flow_templates.sql` through the
normal deployment migration process before enabling the feature in production.
