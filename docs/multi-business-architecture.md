# Multi-business workspace

The workspace resolves every signed-in request to one active organization membership. The selected organization lives in an HTTP-only cookie for browser sessions or an `x-remodel-organization-id` header for bearer sessions. The selector is never authorization by itself: `remodel_current_member()` checks the user's live Supabase session, active profile, and active membership before returning the organization and role. With no selection, the user's original organization remains the default.

`remodel_records`, price-book entries, settings, audit events, private files, client links, Gmail connections, Google Calendars, and locations are keyed by organization. Server routes derive the organization from the verified membership or a validated client-portal token, and explicitly scope service-role queries to it. Supabase row-level policies also restrict direct employee reads. The isolated cloud integration test in `tests/multi-organization.spec.ts` checks switching, direct row visibility, revocation, and recovery after a revoked selection.

## Adding a business

1. Apply `supabase/migrations/202610270001_multi_business.sql` before deploying the app. Back up the database first.
2. Only Walker's personal `walker@premiumremodel.com` account may create an organization through the protected `PUT /api/organizations` route. Business creation is not offered in workspace Settings. The database creates the organization and owner membership together.
3. Switch to the new business in the sidebar. **Settings → Business setup** configures company name, contact details, logo, address search region, enabled modules, quote cost visibility, price-book picker, and navigation order.
4. Invite other employees from **Team**. An existing employee account receives another membership and can switch between businesses without a duplicate login. Removing them from one business leaves their other memberships active.
5. If quotes should use saved prices, enable **Price book**, add entries, and enable the quote picker. A selected entry is copied into the quote as a priced scope line with the catalog ID and revision. Later catalog edits do not alter old quotes.
6. Connect a company Gmail account for quote and client portal emails. New businesses default to manual payments. To offer Stripe, bind that organization's own Stripe account through `STRIPE_ACCOUNTS_JSON`, then select Stripe in Business setup. Each account must send signed webhook events to `/api/stripe/webhook`.

## Extending the platform

The business configuration schema is in `lib/business-config-schema.ts`; defaults and persistence are in `lib/business-config.ts`. Feature gates belong in both the UI and server route. Add quote pricing modes to the shared scope schema and `lib/project-finances.ts`, then expose them in the quote editor and PDF. The price book is a source of defaults; the saved quote line remains the commercial record.

Stripe account bindings are centralized in `lib/stripe-payments.ts`. Each additional processor needs a server-only connection, a provider-specific checkout and signed callback, and a normalized payment activity. Manual payments already use the activity log. A provider must never use another organization's credentials or infer an organization solely from client-submitted metadata.

The existing Master Services Agreement contains Premium Remodel's legal entity and address. It remains available only to the original organization until a separate agreement template is supplied for another business. The existing Twilio account is also restricted to the original organization. Public website lead intake still targets the original organization; connect new businesses through their own authenticated API keys or add an explicitly bound intake source. Scheduling currently uses Eastern Time across the app, so a business in another time zone needs a time-zone pass before onboarding. The app manifest remains a shared platform surface rather than a per-business branded install.

## Verification

Run `npm run typecheck`, `npm run lint`, and `npm run build` before deployment. The tenant integration test requires `RUN_SUPABASE_TESTS=1` and an isolated Supabase test organization and should never run against the live business database. Apply the migration to a staging database and verify one employee can switch between two organizations while direct database reads and client links stay scoped to the selected one. Deploy the migration before the web build; code using memberships cannot run on the previous schema.
