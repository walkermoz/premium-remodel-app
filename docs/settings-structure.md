# Settings structure and setup questions

This PR reorganizes existing controls and workspaces. It does not add unused configuration fields or claim that Jobber-only features are implemented. Every section below is backed by an existing editor or a link to an existing workspace.

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

### Products & services

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

### Manage team

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

### Schedule & availability

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

### Requests & booking

Manage leads and schedule consultations using the existing intake tools.

- What project, contact information and notes has the customer provided?
- When should your team schedule the consultation?

Scope: current organization. Uses the existing Leads workspace. Deep link: `?view=Settings#intake`.

### Messages & notifications

Configure company communication providers and the workflows that deliver messages.

- Which company email and phone number should send messages?
- Who should receive each workflow notification, and when should it run?

Scope: current organization. Deep link: `?view=Settings#messages`.

### Automations

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

## Jobber additions: what is worth building next?

1. **Business and individual working hours — recommended.** Ask for opening days, local hours, holiday exceptions, staff hours and consultation duration. These must feed availability, booking and reminders; adding hours as unused text fields would be misleading.
2. **Reusable forms and custom fields — recommended, separately scoped.** Ask which record type owns a question, its type/default, whether it is required, who can see it and whether values carry forward. Keep templates separate from completed job forms; coordinate with PR #75.
3. **Invoice and deposit defaults — recommended.** Ask for payment terms, deposit rules, progress-payment stages, disclaimer text and receipt behavior. Integrate with actual invoice/payment logic and preserve issued/signed snapshots. Company check instructions and current payment-provider selection remain editable in this PR.
4. **Message templates and delivery recipients — recommended.** Ask which event, customer/staff recipients, email/SMS channel, reply-to address, quiet hours and retry policy apply. Current recipients remain in the existing workflow editor; this PR links to that canonical editor rather than creating another recipient list.
5. **Portal visibility and customer preview — recommended.** Ask which confirmed schedule items, documents and payment details customers can see, and whether times should be shown. Preserve existing customer URLs and project/customer authorization. Current brand, quote-display and portal-link controls remain available.
6. **Company description, services and policies — useful for a future receptionist.** Ask for service boundaries, FAQs, warranty/cancellation policy and escalation contacts. Reuse legal identity, service catalog and scheduling data rather than maintaining conflicting copies.
7. **Tax rates and groups — assess first.** Ask whether the business needs taxable line items or jurisdiction-specific groups and how these interact with accounting. Do not add a tax field until calculations and document snapshots consume it.
8. **Expense categories and reimbursement defaults — assess with job costing.** Ask for accounting codes, reimbursable categories and approval roles. Coordinate with the existing job-costing work rather than introducing a second ledger.
9. **Do not copy by default:** chemical tracking, legacy master-route setup, Jobber subscription billing or payment features unsupported by our payment provider.

## Reuse and behavior

- One typed settings catalog drives grouped desktop navigation, mobile section selection, search, descriptions, setup questions and role/module visibility.
- BusinessSettings is reused in controlled-section mode; its draft is shared across business pages. Visiting other settings does not discard it. An unload warning protects unsaved business edits; a successful save clears the warning before reload.
- Other editors mount on first visit and remain mounted while browsing Settings, preserving entered connection/account drafts. Leaving Settings still follows each existing editor's save behavior.
- API routes, tenant boundaries, provider credentials, customer access tokens and module semantics are unchanged. This is not a database migration or a new settings persistence layer.
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
