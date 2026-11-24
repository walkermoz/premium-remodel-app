# PR 75: job-tab workflow audit

Audited November 20, 2026 against the recorded ServiceTitan technician walkthrough and current official documentation. This audit covers implemented ServiceBuddy behaviors and does not certify parity with every ServiceTitan module or permission.

## Job — corrected

Customer/location details, contact actions, description, contract timing, and section navigation retain the same job ID. The arrival/work preview now chooses the earliest relevant task or appointment rather than always preferring a later appointment. Required-form counts use operational checklists rather than the legacy MSA flag. Completed-job work items cannot offer edit, delete, or completion actions that the server rejects.

## History — corrected

Location history and customer history have distinct filters. Historical invoices exclude the current job, use its actual billable scope and payment credits, and open their original records. Separate categories expose estimates, read-only submitted/draft forms, files, and team notes. The current job audit trail combines operational actions, notes, file uploads, and payments including credited estimate deposits, with staff/time. It no longer splits those facts into unrelated duplicate feeds. Historic forms cannot be submitted through the history viewer.

Reference: [View job history](https://help.servicetitan.com/docs/view-job-history-1). The global mobile History screen is a separate ServiceTitan surface from the History button inside a job; this navigation is the latter.

## Forms — corrected and verified

Required/optional template instances and drafts persist on the job. Required answers and arrival rules are checked by the server. Submitted forms retain answers and completion staff/time; customer acknowledgement locks adding new requirements until the invoice is reopened. Forms now locates signed agreements on the booked estimate records instead of incorrectly reporting that an agreement is missing from the job. Legacy job agreements remain accessible.

Reference: [Complete and send forms](https://help.servicetitan.com/v1/docs/forms-in-servicetitan-mobile).

## Estimates — corrected and verified

Options remain independent records. Recommending, editing, selling, signing, and booking retain their existing agreement and deposit gates. Booking copies accepted work once and credits its existing deposit. Presentation excludes declined/expired options and internal costs. The handoff button explicitly returns to staff to prepare the signing packet; opening the internal editor is not represented as customer acceptance. Empty options can be removed through recoverable junk controls.

Reference: [Mobile estimate presentation](https://help.servicetitan.com/v1/docs/servicetitan-mobile-estimates-redesign). ServiceBuddy retains its Premium agreement/deposit requirements and books work to this job. ServiceTitan's separate perform-work-later/install-job workflow is not implemented by this button.

## Invoice — corrected and verified

Invoice scope is separate from quote/deposit navigation. The ledger credits the original estimate payment once, including on reload. Work authorization and final customer acknowledgement represent different decisions and are checked against current invoice contents. Finalization needs a work summary and documented account terms when a balance is due. Finalized invoice items are read-only in both normal and advanced editors. The new customer document can be printed/saved as PDF without internal costs, office controls, or unrelated records. Printing clones safe DOM into a dedicated document rather than treating customer text as executable HTML. This does not send an invoice email.

References: [Print or email invoices](https://help.servicetitan.com/docs/print-email-invoice-or-estimate-in-servicetitan-mobile), [Required signatures](https://help.servicetitan.com/docs/use-the-contactless-experience-for-required-job-signatures-in-fma).

## Schedule — corrected

Appointments now appear in both job and company list/calendar views with the same date/time/status and safe customer calendar projection. Clicking an appointment opens its job schedule rather than a task editor. Scheduled visits can be rescheduled with a required reason, keeping their ID and audit history. Started/completed visits are retained; staff must book a return visit rather than rewriting an actual visit. Same named crew overlaps are rejected in application rules and in the atomic database operation, including across jobs. Organization-level serialization prevents a concurrent cross-job booking race. Booking uses the same estimate/job lock order as estimate edits. Linked Google calendars sync after appointment changes using the stored appointment times; the preview does not contact live calendars.

References: [Reschedule a job](https://help.servicetitan.com/docs/reschedule-a-job-with-servicetitan-mobile), [Mobile calendar](https://help.servicetitan.com/v1/docs/use-the-calendar-in-fma).

Existing homeowner SMS reminders still concern the scheduled work-item system; the caption now says so explicitly. This change does not introduce new automatic texts. Crew names remain free-text assignments, not a payroll/timesheet or multi-technician identity model.

## Notes — verified

Team notes retain their job association, author, timestamp, and attachments. Switching tabs preserves a draft. A failed save keeps the draft/request identity and uploaded files for a retry. Reloads retain saved notes, and other jobs do not inherit them. Author/admin deletion rules remain enforced. Notes and their attachments also appear in History. Notes remain append-only with author/admin removal; ServiceTitan's note pinning/editing is not added here.

## Photos & files — verified

Uploads remain private to the organization/job and use the existing content validation and 4 MB file policy. Note attachments are the same stored files shown here; retries do not create duplicates. Preview/download and admin cover/deletion behavior are preserved. File uploads are now represented in the job audit trail. Existing supported formats remain authoritative; this is not ServiceTitan's full video/phone-capture system.

Reference: [Job media](https://help.servicetitan.com/v1/docs/phone-capture-in-servicetitan-mobile).

## Closeout — verified

The server checks required forms, current work authorization/final acknowledgement, finalized invoice, payment or documented account terms, empty estimates, unbooked sold work, open tasks, and remaining visits. A zero-price estimate with a real item is not treated as empty. Direct status changes cannot bypass completion checks. Completed jobs lock operational work while still allowing notes, files, and payments through their existing rules.

Reference: [Complete a job](https://help.servicetitan.com/v1/docs/complete-a-job-in-servicetitan-mobile).

## Validation and limits

`tests/job-tab-audit.spec.ts` exercises all nine tabs, customer/location isolation, historical form read-only behavior, booked agreements, customer-safe print output, declined presentation, finalization locks, rescheduling persistence, shared calendars, notes/files/history, closeout, and phone overflow. Pure tests cover appointment selection, collision rules, status projections, and zero-price estimates. The actual migration is exercised in PGlite for cross-job conflicts, tenant/version checks, booking idempotence, ledger credits, and closeout enforcement. Existing notes, calendar, finance, and signing regressions remain part of the check.

Authenticated live Supabase tests require the isolated cloud test configuration. No production migration, customer message, payment, or merge is part of this audit. Apply the PR's job-operations migration before authenticated use. Recurring services, equipment, business-unit form rules, granular ServiceTitan technician permissions, payroll/timesheets, and follow-up opportunity automation remain outside this PR and are not shown as working features.
