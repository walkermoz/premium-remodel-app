# Premium Remodel

A shared company job workspace built with Next.js and hosted on Vercel, using the company’s existing Supabase project for Postgres, employee authentication, and private file storage. Branding comes from [premiumremodel.com](https://premiumremodel.com).

## Features

- Existing company employee accounts sign in with Supabase Auth.
- Projects with address, client, contract price, dates, status, and full scope of work.
- Address autocomplete in new/edit project forms searches [Wake County's MAR address records](https://www.arcgis.com/home/item.html?id=4d7f78186b0649d081ac56058b041fb7) first, including Cary and Raleigh. Local matches take priority; when none are found or the county service is unavailable, the public [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md) searches other US addresses with a Raleigh location preference. Explicit other-state searches skip the county lookup. Suggestions include the applicable [Wake County CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) or [OpenStreetMap attribution](https://www.openstreetmap.org/copyright). No API keys or new account are required. Browser requests start after four characters and a 450 ms pause; results are cached in memory and stale requests cancelled. County requests time out after four seconds and fallback requests after five seconds. Existing saved addresses are not searched until edited. Public services have no availability guarantee; keyboard selection and manual entry remain available.
- Compact project-type badges beside the status; projects without photos have no oversized placeholder.
- Red Planning/To do, yellow In progress, green Completed/Done, and gray On hold status labels. Project cards and details show calendar days on contract (start date is day 1, Eastern Time), including time on hold. Starting with no start date fills today; completing records an editable actual completion date and freezes the total. Reopening resumes the count from the original start date. Existing completed projects without an actual completion date ask for one instead of using the target date.
- Tasks with contractor assignments, priorities, deadlines, and notes.
- Upcoming combines tasks, inspections, deliveries, and contractor visits in the workspace and each project. Switch between grouped List and Calendar views with shared project/type/status/search filters. Dates and optional start/end times are shown in Eastern Time; existing undated tasks remain under Unscheduled. Project milestones appear alongside work.
- Each employee can optionally connect a Google account from Settings. Premium Remodel creates a separate private Google calendar and automatically copies project milestones, scheduled work, and quote appointments into it. The built-in calendar remains the source of truth; the narrow OAuth permission applies only to calendars created by this app.
- Itemized scope estimates and subcontractor costs, plus CSV job master sheet export.
- Contractor directory with separate service filters, phone call buttons, and assigned tasks.
- Add a contractor with full contact details directly from a work item's contractor selector; the saved contact is selected automatically and the work draft stays intact.
- Private project photos and documents, employee comments, and shared updates.
- Workspace and project Activity feeds for customer payments, material deliveries, subcontractor payments and general updates. Choose the project and teammate, record an amount when relevant, and attach up to three receipts/photos. Project views total logged customer payments and subcontractor payments independently of scope estimates. The overview shows the latest five activities across all projects beneath its stats, with project links and Show more when additional entries are available.
- Light, Dark and System themes in Settings → Appearance, plus a sun/moon toggle in the top bar and on login. The browser remembers the preference, shares changes across its tabs, and applies it before the page paints. System mode follows device appearance changes; theme selection does not change the company's settings.
- Generate renovation concepts for bathrooms, kitchens, decks, basements, attics, sheds, or a custom project. Take/upload a photo, choose a project-specific style, select an image model, compare before/after, and download the result. The shared default image model is managed by administrators in Settings.
- Administrator invitations by email or a private link; immediate employee access removal.
- A focused Door knocking workspace with a shared house-visit map, visit times, outcomes, and notes. Interested homeowners can become contacts and leads in the same save, and scheduled quote appointments appear on the company calendar. The restricted door-knocker role shares visit pins while limiting each canvasser to the contacts and leads they captured; administrators retain the full view.
- Password changes, session revocation, stale-edit protection, and server-side input validation.
- Responsive layouts and a separate browser-only sample workspace at /demo.

## Infrastructure

The Vercel web project is **servicebuddy-ui**. This app includes its own Next.js API routes; the previous separate Hono API is not required by v2.

The existing Supabase project is **peeumpztticngltfszna**. Existing `organizations`, `profiles`, and Supabase Auth users are reused. Active owner/admin profiles are administrators; office/crew/field profiles are team members. Door-knocker profiles use the focused outreach workspace. Customer portal profiles cannot access this workspace.

The additive migration creates:

- `remodel_records`: company-scoped projects, tasks, contractors, scope items, comments, activity, door visits, leads, and file metadata.
- `remodel_rate_limits`: server-only request limits.
- `remodel_settings`: company-scoped default image model, readable only by active employees; validated administrator writes go through the API.
- `remodel_google_calendar_connections`: server-only per-employee Google account metadata and encrypted refresh tokens. Browser and authenticated Data API access are revoked.
- `remodel-files`: a private Supabase Storage bucket.
- Membership/session functions and row-level security policies.

Existing company tables and files are preserved. They are not automatically imported into the redesigned workspace. Demo browser data and the previous local SQLite database are also separate and are not automatically uploaded.

## Run locally

Use Node.js 24 and npm:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and configure the existing Supabase URL, publishable key, service-role key, company organization ID, and app URL. The development server connects to Supabase too; it no longer stores real company data on this computer.

Open [localhost:3000](http://localhost:3000). Sign in with an existing company employee account. There is no public registration or first-user administrator setup.

Without credentials, [the sample workspace](http://localhost:3000/demo) still works. Its fictional data stays in browser storage and never enters the company database.

## Database migration

The migration expects the company's existing `organizations` and `profiles` tables and Supabase Auth/Storage schemas.

```sh
npm run db:migrate
```

`DATABASE_URL` is required only for migration and backup scripts; the web app uses the Supabase Data API. Apply migrations before deploying a new build. This migration is additive and repeatable. Local backups are in the ignored `.local/backups/` folder.

## Vercel deployment

Link the workspace to the existing `servicebuddy-ui` project. Set these production variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only Secret)
- `SUPABASE_ORGANIZATION_ID`
- `APP_URL=https://servicebuddy-ui.vercel.app`
- `OPENROUTER_API_KEY` (server-only Secret, for Generate)
- `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` (server-only Google OAuth web client)
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (server-only Secret containing 32 random base64url bytes)

Then deploy:

```sh
npx vercel --prod
```

No Neon database or Vercel Blob store is used. Never expose the service-role key through a `NEXT_PUBLIC_` variable. Use a separate Supabase project or organization for preview/test data.

## Google Calendar

Enable the Google Calendar API in a Google Cloud project, configure the OAuth consent screen, and create a **Web application** OAuth client. Add these exact authorized redirect URIs:

- `https://servicebuddy-ui.vercel.app/api/google-calendar/callback`
- `http://localhost:3000/api/google-calendar/callback`

The app requests `openid`, `email`, and Google Calendar’s narrow `calendar.app.created` scope. That scope allows Premium Remodel to create and manage its own secondary calendar without reading or changing the user’s existing personal or company calendars. During Google’s testing phase, add each Premium Remodel teammate who will connect as an OAuth test user. Publish or verify the consent screen before wider use if Google requires it.

Store the OAuth client ID, client secret, and encryption key only in `.env.local` and Vercel’s server-side environment. Refresh tokens are encrypted with AES-256-GCM before storage; access tokens stay in server memory and are never returned to the browser. Disconnecting clears the stored token and asks Google to revoke it, while leaving the generated calendar and its existing entries in the user’s account.

Google sync is one-way. The built-in Premium Remodel calendar is authoritative, and subsequent syncs overwrite edits made to synchronized Google events. Successful project/task/appointment changes queue an automatic sync for every connected teammate, and each user can run **Sync now** from Settings. Failed syncs never block workspace saves and appear on the affected user’s Google Calendar settings.

## Renovation previews

Generate uses OpenRouter's [Image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) with the uploaded photo as an image reference. The model list checks current image-input/output capabilities for Nano Banana 2, Nano Banana Pro, GPT Image 2, FLUX.2 Pro and Seedream 4.5. The initial default is Nano Banana 2. Each generation can override the company default; unsupported or removed models are rejected rather than silently substituted.

The browser resizes JPG/PNG/WebP photos (up to 20 MB) before uploading. The authenticated server verifies and normalizes images, strips metadata, validates project/style/model selections, and applies user/company request limits before calling OpenRouter. Calls use company credits and may take a few minutes. Prompts preserve the photographed space and adapt to the selected project, including empty-site deck/shed concepts. Outputs are design concepts, not construction documents.

Photos and results remain in the current app session and are not automatically added to a project. Generation continues while navigating app sections; download results before refreshing or closing the app. The public demo supports controls and a browser-local default only and never calls paid generation. Configure `OPENROUTER_API_KEY` in Vercel as a Secret; it is never returned to the browser.

## Job activity

Activity entries record the person who performed the action separately from the authenticated teammate who logged it. The server resolves actor names from active company profiles and validates all linked projects, contractors and files. Dates/times use the viewer's local time. Payments require a positive amount with at most two decimal places; project totals add integer cents and do not alter estimates or imply net profit. Entries can be deleted by their author or an administrator; attachments remain in project files. General comments saved before Activity remain visible, and old Updates links open the Activity tab.

Completing an Upcoming work item now records its actor/time and adds an activity entry in the same database transaction. Saving an already completed item does not duplicate the entry; reopening retains history and completing it again logs the new completion. Deleting a task retains its completion history. Existing completed tasks are not backfilled with guessed actors or times. Manual activity requests use a per-form UUID so retried saves cannot duplicate payment totals. Uploads happen before the entry is posted; if saving fails, already uploaded files remain in the project's files and are reused on retry.

## Invitations and sign-in

In **Team → Invite teammate**, choose **Send an email** or **Create a link to share**. Both use Supabase-generated, expiring, single-use authentication links bound to the recipient. The recipient accepts the invitation and chooses their name and password.

Email delivery requires working Supabase SMTP/email settings. Provider failures are shown in the app; no success is displayed when sending fails. The private-link option works without SMTP. Invitation expiry follows the project's Supabase Auth email OTP settings.

Supabase Auth's allowed redirect URLs should include `https://servicebuddy-ui.vercel.app/auth/accept` and `http://localhost:3000/auth/accept`. Configure custom domains likewise. The acceptance page supports default Supabase email session fragments, PKCE codes, and token-hash links.

Employees can manage all company jobs. Administrators manage access and file deletion. Removing a member deactivates their existing company profile; their comments and work records remain. Changing a password signs out other sessions. Database membership checks verify that the Supabase session still exists, so revoked sessions do not retain access until their JWT expires.

The app checks company membership on each API request. Supabase RLS also limits record and file reads by company. Database writes pass through validated server routes; direct browser writes to v2 records are denied.

## Files and estimates

New uploads may be up to **4 MB**: JPG, PNG, WebP, static PDF, and UTF-8 TXT only. Scripts, executables, SVG/HTML, archives, Office documents and CSV uploads are blocked. The server verifies extensions, declared types and contents; decodes and rewrites still images (up to 40 megapixels) without source metadata or appended data; parses and reserializes PDFs (up to 200 pages), rejecting encryption, forms, actions, scripts and embedded files. Documents download as attachments with nosniff and sandbox headers.

Antivirus scanning is deferred in [TODO.md](TODO.md). The prepared implementation is preserved in `deferred/antivirus/`, excluded from application builds and deployments. Current protection is strict file validation, not antivirus scanning.

### Twilio connection

Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` as server-only environment variables in `.env.local` and the Vercel production project, then deploy. Never use a `NEXT_PUBLIC_` prefix. Administrators can open Settings → Twilio to verify the account and view its existing numbers and capabilities. The Auth Token is never sent to the browser, stored in workspace records, or returned by the status endpoint. Check connection performs only read-only Twilio API requests; it does not purchase numbers, change routing, make calls, or send messages. Calling and messaging inside the app require a separate implementation. Rotate credentials in Twilio and update the server environment if a token has been exposed.

### Overview alerts

Administrators can post temporary alerts from Settings → Overview alerts. Each alert has a message, an expiration duration, and one or more audiences mapped to the existing Premium Remodel profile roles: Administrators (owner/admin), Office, Crew, and Field. Doorknockers is shown as a future group but cannot be selected yet. Active alerts appear at the top of Overview and rotate every 6.5 seconds when more than one is visible. Hovering or focusing the banner pauses rotation, and reduced-motion preferences suppress the transition. Any administrator can remove an active alert. Audience filtering is enforced by both the app API and the Supabase row-level policy.

Notes accept up to three attachments and can contain just a photo/file. The note stores project attachment IDs, so its files also appear in Photos & files without copying them. Uploaded files remain if note saving fails or the note is deleted; retries reuse completed uploads. Only administrators delete project files. Uploads use a private bucket. Downloads and image previews require an active company account and are never publicly cached. Sample mode keeps files in the browser and performs basic file checks; full content validation is enforced for company uploads on the server.

Scope prices are line totals and their sum is the project price. There is no separate contract price field. Existing agreed amounts are preserved as read-only history; a difference appears as a warning inside the scope total box. The difference between scope total and subcontractor costs does not account for all materials, overhead, or other expenses and is not net profit.

Project overview shows customer payments collected and remaining to collect, in dollars and as percentages of the scope total. It uses existing Payment received activities (including checks), adds cents precisely, and excludes subcontractor payments. Overpayments are shown separately and a zero scope total has no percentage. Log payment opens the activity form with Payment received and Check selected. Deleting a mistaken payment from Activity updates the balance.

## Quotes and leads

Quotes holds draft, sent and declined quotes with client contact details, scope items and private documents/photos. Mark as sent records that the quote was shared; it does not send an email. Accept quote changes the same record into a planning project, preserving its ID, scope, contact details, files and sent date. Acceptance is a conditional atomic update, records the accepting teammate/time, rejects stale versions and safely returns the same project on retries. Quotes are excluded from active project statistics and calendars until accepted.

The migration runner records applied files in `remodel_schema_migrations` and locks concurrent runs, so older kind constraints are not reapplied after quotes exist. Run `npm run db:migrate` before deploying quote support. No existing amounts, records or accounts are changed by this migration.

## Phone installation and team locations

Open **Settings → Use on your phone** for installation instructions. The browser install button appears when supported; iPhone users use Safari’s Share → Add to Home Screen. The manifest and icons launch the existing authenticated workspace as a standalone app. A small service worker caches only the generic offline page, never company pages, API responses, private files, coordinates or map tiles. It provides a reconnect screen rather than an offline copy of company data.

**Team map → Share my location** requests phone/browser permission before starting a sharing session. The same browser tab remembers that session through navigation and reloads. Updates use Geolocation while the document is visible, are throttled to at most once per 15 seconds, and request a fresh fix about every 30 seconds. Hidden pages stop watching and resume when visible; home-screen installation does not enable background tracking. Phone accuracy, connectivity and permissions determine availability.

Only active company administrators can read other teammates’ locations. Members can view and manage their own location. The API always derives identity/company from the signed-in session, and Supabase RLS independently enforces administrator/own-record reads. Direct client writes are blocked. Only the latest position is stored, with accuracy and capture time; no route history is kept. Positions become “last known” after 2 minutes and disappear after 1 hour; expired coordinates are cleared on the next locations request. Stopping sharing removes coordinates and rejects delayed updates to the stopped session. Failed stops are retried after reconnection and clearly marked pending. Users can also remove a previously saved position and stop sharing on other devices. Signing out clears their shared position.

The administrator map uses Leaflet with OpenStreetMap standard tiles and visible attribution. The door-knocking workspace uses MapLibre GL with OpenFreeMap vector tiles, including a brighter street style, building detail, smooth zooming, and an automatic dark style. OpenFreeMap requires no API key and adds the required OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution. Neither map performs bulk downloads or offline caching. Sample mode uses fictional positions and never asks for real geolocation.

Run `npm run db:migrate` before deploying location support. Location tests use isolated test accounts and mocked phone coordinates; production employees are never tracked during verification.


## Admin API keys, lead webhook, and CI/CD

### Admin API keys
Administrators mint and revoke admin-scoped keys in **Settings → Admin API keys**. Secrets are shown once and stored only as SHA-256 hashes.

Authenticated requests use either:

- `Authorization: Bearer sbk_…`
- `X-API-Key: sbk_…`

Endpoints:

- `GET /api/v1/leads?status=New&disposition=Active&limit=50`
- `GET /api/v1/leads/:id`
- `PATCH /api/v1/leads/:id` with any of `notes`, `status`, `disposition`, `nextAction`, `nextActionDue`, `draftReply`, `approvalState`

Lead funnel stages: `New` → `Follow-up` → `Quote drafted` → `Quote sent` → `Won` | `Lost` | `Stale`.  
Dispositions `Archive` / `Junk` / `Spam` / `Test` exit the funnel and are excluded from close rate.

### New-lead webhook
Admin Settings no longer exposes a New-lead webhook UI. Dispatch relies on short-cadence polling for new leads instead of an in-app webhook URL.

Server-side `lead.created` webhook helpers and org columns from migration `202609230001_api_keys_lead_webhook.sql` may still exist for internal/service use; they are not configured from the product UI.

Apply that migration before relying on admin API keys:

```sh
npm run db:migrate
```


### GitHub Actions → Vercel preview
Workflow stub (copy into `.github/workflows/ci.yml` when the pushing account has the GitHub `workflow` scope): `docs/github-actions/ci.yml`

- Every PR: lint, typecheck, Playwright sample tests
- Every PR: Vercel preview deploy **when secrets are configured**

Walker must add these **GitHub Actions repository secrets** (do not invent values here):

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Vercel account token with deploy access to `servicebuddy-ui` |
| `VERCEL_ORG_ID` | Vercel team/org id (`vercel project ls` / dashboard) |
| `VERCEL_PROJECT_ID` | Vercel project id for **servicebuddy-ui** |

Until those secrets exist, the preview job posts a notice and skips deploy. GrokPR’s OAuth token cannot create workflow files directly; Walker (or an account with the `workflow` scope) should copy `docs/github-actions/ci.yml` to `.github/workflows/ci.yml` on this branch or after merge prep. Production remains protected by requiring Walker review before merge to `main`.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
npm test
npm run test:cloud
```

`npm test` runs the sample UI checks and skips cloud mutation tests. `npm run test:cloud` explicitly runs the full integration workflow against the configured Supabase project using a temporary isolated organization and test accounts. It tests sign-in, project/task/scope writes, comments, private uploads/downloads, invitations, membership revocation, password changes, direct Data API restrictions, stale edits, persistence, and mobile layouts. Test records/accounts are removed afterward; tests do not email real teammates.

Never use production employee credentials in tests. Build before running Playwright. Test artifacts, credentials, local backups, and previous SQLite data are excluded from Git and deployment uploads.

See [Supabase's Next.js authentication guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control).
