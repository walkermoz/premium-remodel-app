# ServiceBuddy modularization completion audit

This is the authoritative implementation checklist for turning the current
Premium Remodel workspace into a multi-organization ServiceBuddy platform.
Premium Remodel is the regression tenant: its saved behavior must remain
unchanged unless an explicit product request changes it.

Status meanings:

- **Verified** — implemented and covered by direct code/runtime evidence.
- **Partial** — foundation exists, but at least one required behavior is absent.
- **Open** — the current implementation contradicts or does not implement the requirement.

## Platform and organization identity

1. **Verified — ServiceBuddy platform identity.** The installable web shell, offline fallback, metadata, native shell, and platform errors use ServiceBuddy with the literal SB monogram at every web/PWA/native icon entry point. Tenant-facing portals, scans, messages, quote authors, and business tools use the active organization's saved identity.
2. **Verified — One ServiceBuddy Field app.** The shared app is named ServiceBuddy Field, uses the ServiceBuddy deep-link scheme and SB assets, restores the member session, and renders the selected organization's identity after sign-in. The legacy scheme and bundle ID remain compatibility aliases for installed/TestFlight builds.
3. **Verified — Organization-owned brand assets.** Primary, reversed, square, and banner assets are stored by organization and previewable in context.
4. **Verified — Organization-owned business/compliance/region.** The schema, settings UI, API persistence, Premium Remodel backfill, public room-scan handoff, customer quote/PDF surfaces, communication renderers, workflow policy checks, and workspace displays all resolve the active organization's saved profile, compliance policy, and regional settings. Premium-only legal defaults remain isolated to its locked legacy agreement.

## Webhooks, HTTPS, secrets, and workflow composition

5. **Verified — Stable unique inbound endpoint per webhook workflow.** Each published inbound-webhook workflow owns a rotateable token and durable targeted event.
6. **Verified — Durable queued webhook processing.** Inbound requests enqueue idempotent events and target only their owning workflow.
7. **Verified — Optional inbound authentication.** Secret-header and HMAC-SHA256 modes are supported in addition to the secret URL.
8. **Verified — Arbitrary outbound HTTPS actions.** Public-destination validation, methods, headers, JSON/text bodies, interpolation, timeouts, response capture, and idempotency are supported.
9. **Verified — Organization secret vault.** Values are encrypted, write-only, tenant-scoped, audited, rotateable, and usable for HTTPS URLs or headers.
10. **Verified — Discord is ordinary HTTPS.** New organizations receive a disabled generic HTTPS action and no Discord/Premium copy. Premium Remodel's existing webhook URL is migrated once into its organization vault and the unchanged notification body is republished through the ordinary custom HTTPS action. The old destination remains executable only as rollback compatibility for immutable historical workflow versions.
11. **Verified — Independent workflow versions.** Published runs pin immutable versions; edits create independent drafts and restores create new drafts.
12. **Verified — Editable starter workflows.** Organization copies are ordinary workflow definitions and are not silently overwritten.
13. **Verified — No hard-coded active workflow logic.** The graph supports arbitrary triggers, decisions, waits, mutations, messages, enrollments, and HTTPS. Premium Remodel's active seed now uses ordinary business-presented email, interpolated SMS, generic result tracking, and a vault-backed HTTPS action; `templateKey` code remains read-only compatibility for immutable historical run versions and is not emitted into any active starter.
14. **Verified — Missing connection handling.** Required email, SMS, team-notification, and HTTPS connections raise a non-retryable configuration error. The run stops at that node instead of silently skipping it and retains a manual retry point.

## Permissions, setup, and platform ownership

15. **Verified — Capability-based organization permissions.** The role matrix governs business, branding, compliance, permissions, team, connections, secrets, workflows, agreements, payments, audit, alerts, API keys, price book, quote administration, generation, and team-location access. Matching UI controls and API routes enforce the same capability, while owners retain immutable recovery access. API keys also have independent granular lead read/write scopes and optional expiration.
16. **Verified — Tab visibility is separate from permissions.** Role navigation controls visibility/order; capability assignments control configuration authority.
17. **Verified — Platform owner boundary.** Organization creation requires `platform_owner`, initially backfilled only for `walker@premiumremodel.com` and stored in a delegatable platform table.
18. **Verified — Organization self-service.** Branding, communication, region, roles, connections, workflows, agreement templates and execution, Stripe Connect onboarding, owner-only data-and-file export, and delayed cancellable deletion are configurable. Irreversible deletion runs only after the waiting period through the authenticated lifecycle worker.
19. **Verified — Automations are optional.** New organizations receive Website lead intake as an unpublished, editable starter with a disabled generic HTTPS action. The Automation module starts disabled outside Premium Remodel, core records do not require automation enrollment, and the system-controlled SMS compliance flow remains available to protect connected phone programs.
20. **Verified — Explicit module activation and setup state.** Each organization has saved activation state for Price book, Payments, Door knocking, Image generation, Automations, and Agreements. Business administrators can enable only the modules the company uses; disabled modules are removed from workspace entry points and capability-protected APIs while retaining data. Onboarding distinguishes disabled, enabled-but-unconfigured, and configured states instead of inferring activation from a connection.

## Customer communication and compliance

21. **Verified — Tenant-owned lead intake.** Premium Remodel's existing form stays stable. New organizations receive a generic inbound-webhook lead starter; after publishing, each workflow generates its own secret endpoint and shows copyable lead payload and cURL integration instructions. Onboarding detects the organization-owned endpoint.
22. **Verified — Versioned SMS consent evidence.** Consent snapshots source, version, policy URLs, origin, timestamp, and separate appointment/marketing choices.
23. **Verified — Non-bypassable SMS policy.** SMS actions require the system consent/DND gate; STOP/START/HELP are system-controlled.
24. **Verified — Tenant-owned transactional communication.** Shared lead, quote, portal-link, workflow, PDF, and failure communication requires the active organization's identity at compile time or loads it by organization ID. Positive webhook SMS consent must carry an immutable evidence snapshot matching that organization's saved policy URLs and website origin. Premium wording remains only inside the tenant-restricted legacy MSA flow.
25. **Verified — Admin blocked-run notifications.** A tenant-scoped incident is deduplicated by run and node, creates an administrator-only in-app alert with a direct run link, attempts email through ServiceBuddy or the connected company mailbox, records delivery state, and automatically resolves the incident and hides the alert after a successful retry.

## Agreements and signing

26. **Verified — Organization agreement library.** Administrators can upload validated, hashed PDFs or create ServiceBuddy-authored editable templates. Templates are tenant-scoped, auditable, archiveable, and publish immutable versions with optimistic edit protection.
27. **Verified — Arbitrary agreement fields.** Templates support data-bound text, long text, number, currency, date, checkbox, initials, and signature fields. PDF fields store validated page-relative geometry that is compatible with a future visual drag editor.
28. **Verified — Multi-signer and signing order.** Customer, staff, and arbitrary other signer roles have validated unique IDs and independent signing order; signature and initials fields must reference a real signer role.
29. **Verified — Tenant-owned agreement execution.** Premium Remodel's current MSA is registered as a locked, versioned template only in its organization and its existing flow is unchanged. Other organizations can create immutable packets from published authored or uploaded-PDF templates, bind quote/contact data, assign ordered signers, deliver private expiring links, collect typed fields and signature evidence, preserve signed-link read access, and download a filled signed PDF with positioned fields and an electronic-signature audit page.

## Payments, locale, and isolation

30. **Verified — Configurable offline/check payments.** Organization-owned payee and mailing settings are shown in both the quote portal and completed generic agreement flow. Project payment logging remains provider-neutral, while Premium Remodel's existing signed-MSA check-deposit gate remains isolated to its locked legacy agreement.
31. **Verified — Payment-provider connections and extension boundary.** Stripe Connect OAuth, tenant/account uniqueness, status refresh, deauthorization, Connect-webhook tenant resolution, connected-account Checkout, and legacy Premium compatibility are implemented. Checkout now runs through a typed provider adapter with explicit online-checkout, saved-method, and financing capabilities, so a future financing provider can be registered without rewriting project payment flows.
32. **Verified — US-first regional behavior.** Organization locale/time zone/service area are stored. Price-book currency, schedules, organization work-day boundaries, consultation validation, quote PDFs, room-scan sessions, audit/settings timestamps, communication history, lead/contact displays, workflow-run displays, project finances, scope rows, tasks, files, and quote screens use them. Locale-neutral scheduling internals deliberately use a stable formatter, while the locked Premium MSA remains a U.S.-specific legal document for that tenant only.
33. **Verified — Cross-tenant isolation verification.** Core records, secrets, workflows, connections, assets, agreement relationships, secret encryption context, and storage paths have direct isolation checks. A fresh local Supabase database applies every migration from zero, and a rollback-only two-tenant integration run creates isolated Contact/Lead/Quote records, publishes separate agreements, creates packets/signers/field values and payment connections, proves composite foreign keys reject cross-organization packets, proves processor accounts cannot be reused across businesses, and confirms the second tenant contains no first-tenant identity.
34. **Verified — Organization export/deletion lifecycle.** Organization owners download a tenant-scoped ZIP containing recursively credential-redacted JSON plus all organization-owned uploads and a SHA-256 file manifest. Deletion requires typed-name confirmation, waits 30 days, remains cancellable until processing, and is claimed by a CRON-secret worker. The worker revokes Google Mail, personal calendars, and Stripe Connect, clears Twilio credentials and tenant storage, then executes database removal in one guarded transaction. Failures retain a tombstone, surface the error, and retry without silently completing.

## Completion gate

The modularization goal is complete only when every item above is **Verified**,
Premium Remodel's end-to-end lead/quote/agreement/payment workflows pass against
its saved settings, and a second synthetic organization passes the same flows
without displaying or accessing Premium Remodel data.
