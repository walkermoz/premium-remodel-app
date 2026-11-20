# Jobs, estimates, invoices, forms, and closeout

PR #75 implements the job workflow using the existing tenant record store. The captured ServiceTitan technician walkthrough informed the navigation; official ServiceTitan documentation informed the operational model. ServiceBuddy retains its own quote agreements and deposit rules.

## Record model

- Legacy project IDs continue to represent standalone jobs. No bulk ID conversion or customer-link replacement occurs.
- Explicit project containers (`recordType: project`) group jobs through `parentProjectId`. Each job owns appointments, required/optional forms, an invoice, and closeout.
- Estimate options remain quote records linked through `jobId`. Multiple options can be compared, recommended, and presented with customer prices; internal costs are excluded from presentation.
- Booking requires the existing estimate signature, matching frozen agreement scope, both agreement signatures, and the required deposit. It copies billable items once and records `sourceEstimateId`; the sold estimate and its signed documents retain their original identity.
- Deposits remain on their original estimate activity and are credited to the booked invoice through `invoiceJobId`. The ledger does not duplicate the payment.
- Unassigned/imported estimates remain available in their own inbox. Their established signing and project-conversion workflow is retained for compatibility.

## Operational behavior

Appointments progress Scheduled → Dispatched → Arrived → Done, with pause/resume and reasoned cancellation. Completed visits are retained. Customer calendars receive only the safe public appointment fields.

Forms support drafts and required answers. Completing a field form requires an arrived/completed visit. Submitted forms record staff/time and remain immutable. New jobs start with arrival and completion checklists; older jobs do not silently acquire new required forms.

The invoice is independent of estimate delivery/deposit stages. Staff edit the work summary, invoice items, and collection terms; collect work authorization; finalize; and capture a separate customer invoice acknowledgement. Reopening or changing the signed invoice requires a fresh acknowledgement. Payments use the existing payment ledger.

Closeout checks required forms, completed visits, open work items, empty estimates, unbooked sold work, the finalized invoice, signatures for its current contents, and either payment or documented account terms. Status dropdowns cannot bypass closeout. Staff can reopen a completed job with the existing status control.

## Storage and rollout

Apply `supabase/migrations/202611190001_job_operations.sql` before enabling authenticated writes. The existing production deployment workflow applies migrations before deploying application code. This PR does not apply a production migration or deploy production.

The new API is authenticated, organization scoped, role gated, and checks record versions. A service-role-only RPC atomically books estimates and updates job operations. The database serializes dependent scope/work writes with finalization and completion, rechecks closeout against current stored scope/tasks/payments, and prevents generic job-metadata or completion bypasses. The migration can be replayed.

Preview the synthetic sample at `/demo?scenario=job-workspace&view=Projects&project=p1`. Demo changes persist locally in the browser and use the same business-rule reducer; they do not charge cards, send messages, or alter production records. An authenticated preview sharing an unmigrated database reports the required migration explicitly instead of accepting non-durable updates.

## Validation

The job-workspace tests cover record separation, form drafts/required answers, dispatch/arrival/pause/cancel/completion, signed-scope booking, idempotence, deposit credits, stale versions, tenant isolation, RPC permissions, locked invoice items, unfinished work, stale acknowledgements, and mobile overflow. Database integration uses PGlite against the actual migration. Live Supabase integration tests require separately configured credentials and are not substituted by the demo.

## Reference behavior

- [Project records](https://help.servicetitan.com/v1/docs/understand-project-records): project containers, associated jobs and appointments.
- [Jobs and projects](https://help.servicetitan.com/v1/docs/jobs-and-projects): multiple appointments per job and multiple jobs per project.
- [Mobile estimates](https://help.servicetitan.com/v1/docs/servicetitan-mobile-estimates-redesign): multiple options, recommendation, presentation, and acceptance.
- [Forms in mobile](https://help.servicetitan.com/v1/docs/forms-in-servicetitan-mobile): required/optional forms, drafts, and arrival restrictions.
- [Complete a job and close its invoice](https://help.servicetitan.com/how-to/complete-job-close-invoice): forms, appointments, invoice, payment, and final signatures gate closeout.
- [Required job signatures](https://help.servicetitan.com/docs/use-the-contactless-experience-for-required-job-signatures-in-fma): work authorization and invoice acknowledgement have distinct purposes.

This is an implementation of those core workflow behaviors in ServiceBuddy, not an integration with or reproduction of ServiceTitan's accounting, pricebook, or permission system.
