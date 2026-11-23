# Settings structure and setup questions

This PR organizes existing settings and adds organization-owned working hours, custom fields, reusable project forms, contract invoice defaults, message templates and portal visibility. Each setting below is connected to its supported workflow. Jobber-inspired organization reuses our existing permissions, providers and record editors.

## Final navigation after cleanup

The sidebar has **22 primary entries** with **30 retained configuration panes**. Provider editors, company controls and role controls use inline subsections; those subsections are not additional sidebar pages.

- **Company:** company details, brand/documents, and compliance/region.
- **Roles & access:** permissions and navigation by role, sharing the existing business draft/save flow.
- **Connected accounts:** actual company email, phone/texting, Stripe and Google reviews editors. Personal Google Calendar stays in My account. Disabled providers and unauthorized editors stay hidden.
- **Customer portal:** portal visibility and display-only working hours.
- **Advanced:** workflow secrets, developer API access and organization lifecycle, collapsed until needed or found through search.
- **Setup checklist:** expanded while required setup remains incomplete; completed setup becomes a collapsed, reopenable summary. Optional unconnected providers do not block completion.
- Other real editors remain directly available: modules, custom fields, quotes/payments, agreement templates, quote flows, forms, invoice defaults, message templates, alerts, history, AI tools and personal account/device preferences.

The Products & services, Manage team, Schedule & availability, Requests & booking and Automations shortcut pages are removed. Their tools remain in Price book, Team, Upcoming, Leads and Automation. Existing `#products`, `#team`, `#schedule`, `#intake` and `#automations` links redirect to the authorized workspace rather than show an intermediate page. The Messages hub is removed; `#messages` reaches the user's permitted message/template or connection settings.

Old company, role, provider and working-hours hashes still select the corresponding inline editor. Search matches child settings and opens the matching editor, not merely the group's first page. All group wrappers preserve the editor's own role, capability and module checks. Company and provider drafts survive changing groups and subsections.

The detailed questions below include the retired shortcut destinations as compatibility references; they are not extra Settings pages.

## Get started

### Setup checklist

Check the connections and defaults your business needs.

- Are your company details complete?
- Are email, phone, payments and calendar ready?

Scope: current organization. Deep link: `?view=Settings#setup`.

## Business

### Company details

The company identity used throughout your workspace and quotes.

- What company name, website, email and phone should customers see?
- Should address suggestions prioritize Wake County or search nationwide?

Scope: current organization. Deep link: `?view=Settings#company`.

### Brand & documents

Your logos, workspace identity and customer portal banner.

- Which primary logo, reversed logo and square mark should we use?
- What banner should appear in the customer portal?

Scope: current organization. Deep link: `?view=Settings#brand`.

### Products & services (workspace shortcut retired)

Manage reusable labor, materials and contractor pricing in your price book.

- Which items and prices should your team reuse?
- What costs, units and descriptions should each item include?

Scope: current organization. Uses the existing Price book workspace. Available when the priceBook module is enabled. Deep link: `?view=Settings#products`.

### Modules

Choose the product areas this organization uses.

- Which optional tools should this business enable?
- Who should have access after a tool is enabled?

Scope: current organization. Deep link: `?view=Settings#modules`.

### Compliance & region

Legal identity, messaging policies, offline payment instructions and regional defaults.

- What legal name, terms, privacy policy and SMS help details apply?
- Who are checks payable to, and where should customers mail them?
- Which timezone, locale and service area should the workspace use?

Scope: current organization. Deep link: `?view=Settings#compliance`.

## Team

### Manage team (workspace shortcut retired)

Invite people and manage existing workspace members.

- Who needs access to this business?
- What name, contact information and role should each member have?

Scope: current organization. Uses the existing Team workspace. Deep link: `?view=Settings#team`.

### Navigation by role

Choose and order the workspace tabs each role sees.

- Which workspace areas should each role see?
- In what order should those areas appear?

Scope: current organization. Deep link: `?view=Settings#access`.

### Roles & permissions

Control which actions each role can manage.

- Who can manage company settings, money, templates and connections?
- Who can see costs, signing tools and audit history?

Scope: current organization. Deep link: `?view=Settings#permissions`.

### Schedule & availability (workspace shortcut retired)

Manage scheduled work and connect your own Google Calendar.

- When is work scheduled, and who is assigned?
- Which personal Google Calendar should receive your assigned tasks?

Scope: current organization. Uses the existing Upcoming workspace. Deep link: `?view=Settings#schedule`.

## Work

### Quotes & payments

Quote editor tools, customer price detail and online payment method.

- Should quotes show internal costs and the price-book picker?
- Should customers see item prices or just the project total?
- Should online payment links use Stripe or manual payments only?

Scope: current organization. Deep link: `?view=Settings#quotes`.

### Agreement templates

Reusable organization-owned agreement documents and signing setup.

- What agreement text and signing fields should each template contain?
- Which documents should your team reuse?

Scope: current organization. Available when the agreements module is enabled. Deep link: `?view=Settings#agreements`.

### Quote & agreement flows

Build and publish the stages from quote approval through project creation.

- Which documents, questions and signatures are required?
- Which published flow should be the organization default?

Scope: current organization. Available when the agreements module is enabled. Deep link: `?view=Settings#quote-flows`.

## Customers

### Customer portal

Find the existing controls for customer documents, branding and project access.

- What branding and price detail should customers see?
- Which quote or project portal link should you share?

Scope: current organization. Deep link: `?view=Settings#portal`.

### Requests & booking (workspace shortcut retired)

Manage leads and schedule consultations using the existing intake tools.

- What project, contact information and notes has the customer provided?
- When should your team schedule the consultation?

Scope: current organization. Uses the existing Leads workspace. Deep link: `?view=Settings#intake`.

### Messages & notifications (hub retired)

Configure company communication providers and the workflows that deliver messages.

- Which company email and phone number should send messages?
- Who should receive each workflow notification, and when should it run?

Scope: current organization. Deep link: `?view=Settings#messages`.

### Automations (workspace shortcut retired)

Reuse the workflow editor for triggers, branches, recipients and delivery results.

- What event should trigger the workflow?
- What conditions, recipients and actions should apply?

Scope: current organization. Uses the existing Automation workspace. Available when the automations module is enabled. Deep link: `?view=Settings#automations`.

## Connections

### Connected accounts

Open the company or personal connection you want to configure.

- Which provider needs setup or reconnection?
- Is this a company account or your own calendar?

Scope: current organization. Deep link: `?view=Settings#connections`.

### Company email

Connect the Google account used to send company email.

- Which Google account should send company email?

Scope: current organization. Deep link: `?view=Settings#email`.

### Phone & texting

Configure the shared Twilio account and company texting number.

- Which Twilio account and existing phone number should this business use?

Scope: current organization. Deep link: `?view=Settings#phone`.

### Google reviews

Connect the Google account that manages your business profile.

- Which Google account and business location should supply the reviews?

Scope: current organization. Deep link: `?view=Settings#reviews`.

### Stripe payments

Configure the Stripe connection used by this organization.

- Which Stripe account should process customer payments?

Scope: current organization. Available when the payments module is enabled. Deep link: `?view=Settings#stripe`.

## Workspace

### Company alerts

Create and remove notices shown to workspace roles.

- What notice should your team see, and which roles should see it?

Scope: current organization. Deep link: `?view=Settings#alerts`.

### Workspace history

Review the organization's existing audit history.

- Who changed a record, and when?

Scope: current organization. Deep link: `?view=Settings#history`.

### AI tools

Choose the existing generation settings for this business.

- Which model and generation defaults should the team use?

Scope: current organization. Available when the imageGeneration module is enabled. Deep link: `?view=Settings#generation`.

### Workflow secrets

Manage encrypted credentials used by workflows.

- Which credentials do your workflow actions require?

Scope: current organization. Deep link: `?view=Settings#secrets`.

### Developer API access

Create and revoke organization API keys using the existing key manager.

- Which integration needs API access, and when should that access end?

Scope: current organization. Deep link: `?view=Settings#api-keys`.

### Organization

Owner-only organization lifecycle controls.

- Do you need to archive or restore this business?

Scope: current organization. Deep link: `?view=Settings#organization`.

## My account

### Account security

Change your own password and secure your account.

- What new password should protect your account?

Scope: current user/device. Deep link: `?view=Settings#security`.

### My Google Calendar

Connect your own calendar for assigned work.

- Which Google account and calendar should receive your assigned tasks?

Scope: current user/device. Deep link: `?view=Settings#calendar`.

### Appearance & device

Your display preferences and app installation.

- Which theme should this device use?
- Would you like to install the app?

Scope: current user/device. Deep link: `?view=Settings#appearance`.

## Operating settings added in this PR

Implemented additions (PR #76):

- **Working hours** (`#working-hours`). Ask: Which opening hours and holiday exceptions should customers see in the portal? Show or hide the display under Contact us. Uses the organization timezone. These hours never restrict scheduling, workflow execution, email or SMS. The former booking-block control is removed; old stored blocking flags are ignored.
- **Custom fields** (`#custom-fields`). Ask: What is the field label and type? Which contacts, quotes or projects own it? Is it required, defaulted, transferred or customer-visible? Editors support short/long text, numbers, checkboxes, dropdowns and dates. A stable field ID ties records to definitions. Archive saved fields instead of deleting or changing their type/targets/options. Explicitly opted-in values transfer contact → quote → project. Server-created public projections exclude internal values; signed quote snapshots retain labels/values while current visibility can still hide them.
- **Reusable forms** (`#forms`). Ask: What questions should the crew answer? Which answers are required? Should every new project receive the form? Is completion required before project closeout? Assign forms from the project Forms tab. Assigned copies snapshot their questions and requirement; template edits apply to new assignments. Save incomplete drafts; completion validates all required answers and stamps the authenticated actor/time. Completed answers cannot be rewritten; assign a correction copy. Required forms block transition to Completed. PR #75 remains independent; its job-workspace Forms tab should consume this shared template/snapshot model when the PRs are combined, rather than retain its hardcoded templates.
- **Invoice defaults** (`#invoice-defaults`). Ask: What invoice title, deposit percentage, deposit due days after signing, and customer note should new quotes use? Defaults are snapshotted on quote creation/import and included in the prepared agreement digest. Remaining default milestones are adjusted proportionally to total 100%; existing manually saved milestones remain authoritative. The signed agreement produces the contract invoice, displays its note/deposit due date, and preserves historical defaults. This is our existing contract invoice model, not a separate standalone invoice builder. Provider selection, tax/price behavior and company check instructions remain in existing editors.
- **Message templates** (`#message-templates`). Ask: What should the quote email subject/body, website acknowledgement subject/body and daily schedule SMS footer say? Quote composer defaults remain editable per send. Lead sends render the saved template through the escaped business-email renderer and log actual delivered text. Schedule reminders use the saved footer. Supported variables: `{{firstName}}`, `{{clientName}}`, `{{businessName}}`, `{{quoteName}}`, `{{quoteNumber}}`, `{{senderName}}`. Sending accounts, consent, workflow triggers, recipients and retry policies stay in their canonical existing editors. Previewing templates never sends a message.
- **Portal visibility** (`#portal`). Ask: Can customers access schedules, times, quotes, agreements, invoices, online payment methods/payments, and requests? Payments require invoices. Hidden sections are removed from navigation and direct section requests show Contact us. Public PDFs, signing, payment setup, flow actions, agreement packet tokens and portal request submission enforce the organization policy. Schedule times are stripped by the server when hidden. Existing customer links and project authorization remain intact. Contact us always remains accessible. Staff records and provider callbacks are unaffected.

### Persistence and rollout

Apply `supabase/migrations/202611210001_operating_settings.sql`, `supabase/migrations/202611220001_contact_version_text.sql`, `supabase/migrations/202611220002_door_visit_operating_defaults.sql` and `supabase/migrations/202611220003_release_communication_windows.sql` before enabling live configuration. Door-visit capture accepts validated defaults atomically; pre-migration previews retain ordinary capture when no custom defaults are configured. The operating-settings migration creates one organization-keyed JSON settings row, revision compare-and-swap, RLS and no direct anon/authenticated table privileges. Only authenticated organization members with `business.manage` can mutate settings through the API. All reads and writes scope the server-owned organization ID. Concurrent edits return 409; settings edits write section/revision audit metadata without logging customer values. Missing migration returns defaults so existing workspace behavior continues; saving clearly reports that setup is required.

Preview `/demo?view=Settings` saves sample settings locally and runs the same record validation, assignment and field-transfer logic. It never changes production or sends customer notifications. New settings default to current behavior: hours disabled, all portal sections visible, 50% deposit, no custom fields/forms, and existing message copy. This PR does not apply a production migration, merge PR #75 or deploy production.

## Reuse and behavior

- One typed settings catalog drives grouped desktop navigation, mobile section selection, search, descriptions, setup questions and role/module visibility.
- BusinessSettings is reused in controlled-section mode; its draft is shared across business pages. Visiting other settings does not discard it. An unload warning protects unsaved business edits; a successful save clears the warning before reload.
- Other editors mount on first visit and remain mounted while browsing Settings, preserving entered connection/account drafts. Leaving Settings still follows each existing editor's save behavior.
- Existing provider configuration, credentials, access tokens and module semantics remain in their canonical editors. Operating defaults use a separate organization-keyed table and authenticated API; portal actions and interactive record writes enforce those settings.
- Existing section hashes resolve: business → branding, workspace → appearance, account → security. Connection target IDs and setup checklist buttons open their focused editors. Browser back/forward works between section choices.
- Product, team, lead, scheduling and automation pages reuse their existing workspaces and are shown only when the role can open the destination. Unsupported setup controls are not rendered as pretend toggles.
- Owner recovery access remains intact; modules still gate their editors. Secrets and API management follow their own capabilities instead of being implicitly hidden behind connection management.

## Validation

The PR checks settings navigation, restricted roles, deep links, mobile layout, draft retention, setup checklist targets, brand previews, quote display, provider setup, model defaults, alerts and related existing workflows. Integration tests requiring a disposable Supabase project are skipped unless explicitly configured; a preview demo is synthetic data, not a live-provider connection test.

## Research sources

Reviewed November 20, 2026. Jobber menus vary by plan, region, connected apps and schedule version.

- [Company settings, hours and regional defaults](https://help.getjobber.com/en/articles/company-settings/)
- [Business profile](https://help.getjobber.com/en/articles/business-profile/)
- [Client document presentation](https://help.getjobber.com/en/articles/client-document-settings/)
- [Products and services](https://help.getjobber.com/en/articles/products-services-list/)
- [Custom fields](https://help.getjobber.com/en/articles/custom-fields/)
- [Work settings](https://help.getjobber.com/en/articles/work-settings/)
- [Team management](https://help.getjobber.com/en/articles/manage-teamhow-to-add-manage-and-deactivate-team-members/)
- [Permissions](https://help.getjobber.com/en/articles/user-permissions/)
- [Checklists, formerly Job Forms](https://help.getjobber.com/en/articles/checklists/)
- [Requests and Bookings](https://help.getjobber.com/en/articles/requests-and-bookings-settings/)
- [Client Hub settings](https://help.getjobber.com/en/articles/client-hub-settings/)
- [Emails and text messages](https://help.getjobber.com/en/articles/emails-and-text-messages-settings/)
- [Automations](https://help.getjobber.com/en/articles/custom-automation-builder/)
- [Payments](https://help.getjobber.com/en/articles/manage-your-jobber-payments-settings/)
- [Connected apps](https://help.getjobber.com/en/articles/app-marketplace/)
- [Location timers](https://help.getjobber.com/en/articles/location-timers-in-the-jobber-app/)
- [Legacy routing caveat](https://help.getjobber.com/en/articles/route-optimization-through-the-settings-menu/)

Automated record actions use the same operating rules as staff forms, including form closeout and frozen invoice terms. New intake records and PDF imports may retain incomplete required office answers so leads are never discarded for an unasked question. Staff changes to those answers, and automated updates, still validate required values. Lead email actions expose a Message source choice: Company lead acknowledgement follows the latest saved company copy; Custom workflow message retains independent text. Unedited older starter nodes follow company defaults too. Dry tests show the actual rendered subject and body without sending.

Automations can send 24/7, including on closed days. The separate communication-window restriction and its editor are removed; legacy published window settings are ignored. The release migration makes automatic window-held messages due for the next worker cycle, while preserving explicit Wait nodes and scheduled triggers.
