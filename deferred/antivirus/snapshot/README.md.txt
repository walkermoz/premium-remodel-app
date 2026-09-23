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
- Itemized scope estimates and subcontractor costs, plus CSV job master sheet export.
- Contractor directory with separate service filters, phone call buttons, and assigned tasks.
- Add a contractor with full contact details directly from a work item's contractor selector; the saved contact is selected automatically and the work draft stays intact.
- Private project photos and documents, employee comments, and shared updates.
- Workspace and project Activity feeds for customer payments, material deliveries, subcontractor payments and general updates. Choose the project and teammate, record an amount when relevant, and attach up to three receipts/photos. Project views total logged customer payments and subcontractor payments independently of scope estimates. The overview shows the latest five activities across all projects beneath its stats, with project links and Show more when additional entries are available.
- Light, Dark and System themes in Settings → Appearance, plus a sun/moon toggle in the top bar and on login. The browser remembers the preference, shares changes across its tabs, and applies it before the page paints. System mode follows device appearance changes; theme selection does not change the company's settings.
- Generate renovation concepts for bathrooms, kitchens, decks, basements, attics, sheds, or a custom project. Take/upload a photo, choose a project-specific style, select an image model, compare before/after, and download the result. The shared default image model is managed by administrators in Settings.
- Administrator invitations by email or a private link; immediate employee access removal.
- Password changes, session revocation, stale-edit protection, and server-side input validation.
- Responsive layouts and a separate browser-only sample workspace at /demo.

## Infrastructure

The Vercel web project is **servicebuddy-ui**. This app includes its own Next.js API routes; the previous separate Hono API is not required by v2.

The existing Supabase project is **peeumpztticngltfszna**. Existing `organizations`, `profiles`, and Supabase Auth users are reused. Active owner/admin profiles are administrators; office/crew/field profiles are team members. Customer portal profiles cannot access this workspace.

The additive migration creates:

- `remodel_records`: company-scoped projects, tasks, contractors, scope items, comments, activity, and file metadata.
- `remodel_rate_limits`: server-only request limits.
- `remodel_settings`: company-scoped default image model, readable only by active employees; validated administrator writes go through the API.
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

Then deploy:

```sh
npx vercel --prod
```

No Neon database or Vercel Blob store is used. Never expose the service-role key through a `NEXT_PUBLIC_` variable. Use a separate Supabase project or organization for preview/test data.

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

Project attachments now require Cloudmersive Advanced Virus Scan (`CLOUDMERSIVE_API_KEY`, server only). The original is scanned before image/PDF parsing; rewritten bytes are scanned again unless unchanged. Only a complete, explicitly clean verdict is accepted. Threats return 422; timeouts, malformed responses, quota errors and missing credentials return 503. Nothing is stored on these failures. The private attachment record includes provider, timestamp, policy version, source hash and stored SHA-256. Downloads require a clean record and verify the stored hash. Unscanned/blocked attachments cannot be opened or linked to new notes/activities. The storage migration denies direct browser/API access to the bucket, including signed-URL creation, so users must use the authenticated file route. Existing signed URLs should be considered valid until their original expiry; the app never issues them.

The provider receives file contents over HTTPS with a generic filename; no project/client names, bucket credentials or storage links are sent as metadata. File contents themselves can contain private information. Cloudmersive states its stateless APIs do not retain processed payloads ([security](https://cloudmersive.com/security)). The production plan must support 4 MB files and sufficient requests; a rewritten attachment can consume two scans. The published free evaluation tier has a smaller 3.5 MB limit. Never use a public malware-sharing service for company documents. Antivirus and file validation reduce risk but do not guarantee malware-free files. Keep dependencies current and do not interpret a clean result as a guarantee.

### Antivirus activation and existing attachments

**Deferred by user request on September 13, 2026; tracked in [TODO.md](TODO.md).** Antivirus is not active in production. The prepared local integration requires scanner configuration before deployment; there is no production bypass. Production remains on the previous validation-only release. Separate this pending integration before deploying unrelated changes so a missing scanner key does not interrupt uploads or downloads. Do not apply its storage migration while activation is deferred.

1. Add `CLOUDMERSIVE_API_KEY` to Vercel Production and the local private environment used for rollout. Do not commit or paste keys into logs. No provider subscription is created by this app.
2. Run `npx tsx scripts/verify-antivirus.ts`. This contacts the **real engine**, verifies a harmless clean file is accepted, and the industry-standard EICAR test is rejected. Do not enable the release unless both succeed.
3. Review `npx tsx scripts/scan-existing-files.ts` (dry run), then run it with `--apply`. It only processes attachments in `SUPABASE_ORGANIZATION_ID`. Clean files are rewritten to a new immutable path and receive a scan receipt. Rejected files are marked blocked and retained privately. Scanner failures stop the rollout. Updates are conditional to prevent overwriting concurrent changes. Scan receipts are tied to the bytes at upload time, not a scheduled continuous re-scan.
4. Deploy this release, then immediately run `npm run db:migrate` to apply `202609130001_antivirus_storage.sql`. Until that policy is applied, direct company storage access could bypass the API. Verify direct reads/uploads/signing are denied and clean downloads still work before calling activation complete.
5. Check Settings → File security for configuration and pending/blocked counts. After activation, rolling back the API also requires preserving its server-only storage access; do not remove the storage restriction to work around scanner outages.

Integration tests use an explicitly isolated fetch stub in `tests/scanner-preload.mjs` with a dummy key; this stub is excluded from Vercel and cannot be enabled by a production request or environment toggle. These tests verify fail-closed application behavior, not actual malware detection. `verify-antivirus.ts` is the separate real-provider acceptance test. Demo files stay in the browser and are never antivirus scanned. Generate's transient photo processing is separate from project attachment storage.

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

The administrator map uses Leaflet with OpenStreetMap standard tiles and visible attribution. Tiles load directly from OpenStreetMap using normal browser caching and referrer headers; there is no bulk download, offline map cache or map API key. Sample mode uses fictional positions and never asks for real geolocation.

Run `npm run db:migrate` before deploying location support. Location tests use isolated test accounts and mocked phone coordinates; production employees are never tracked during verification.

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
