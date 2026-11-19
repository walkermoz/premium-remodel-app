import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { jobWorkspaceDemo } from "../lib/demo-job-workspace";
import { jobRecords, sameJobCustomer } from "../lib/job-workspace";
import {
  applyJobAction,
  jobOperations,
  closeoutIssues,
  invoiceDocument,
  authorizationDocument,
  estimateBookingIssue,
} from "../lib/job-operations";
import { projectFinances } from "../lib/project-finances";

test("jobs, estimates, projects, invoices and signed scope have independent identities", () => {
  const workspace = jobWorkspaceDemo();
  const job = workspace.projects[0];
  expect(jobRecords(workspace)).toHaveLength(6);
  expect(
    jobRecords(workspace).every(
      (entry) =>
        entry.kind === "project" && entry.record.recordType !== "project",
    ),
  ).toBe(true);
  expect(
    sameJobCustomer(
      { ...job, contactId: "one" },
      { ...job, id: "other", contactId: "two" },
    ),
  ).toBe(false);
  expect(
    projectFinances(job, workspace.scope, workspace.activities).total,
  ).toBe(0);
  const sold = workspace.quotes!.find((quote) => quote.status === "Accepted")!;
  expect(estimateBookingIssue(sold, workspace)).toBe("");
  expect(
    estimateBookingIssue({ ...sold, quoteAcceptance: undefined }, workspace),
  ).toContain("signature");
  expect(
    estimateBookingIssue({ ...sold, contractPrice: 1 }, workspace),
  ).toContain("match");
});

test("form drafts, appointment transitions, invoice acknowledgement and account terms gate closeout", () => {
  const workspace = jobWorkspaceDemo();
  let job = workspace.projects[0];
  workspace.scope.push({
    ...workspace.scope[0],
    id: "billable-test",
    projectId: job.id,
    estimate: 100,
  });
  const now = new Date().toISOString();
  const act = (input: Parameters<typeof applyJobAction>[2]) => {
    job = applyJobAction(
      job,
      workspace,
      input,
      { name: "Alex" },
      now,
      "new-id",
    );
    workspace.projects[0] = job;
  };
  expect(() => act({ action: "complete" })).toThrow();
  expect(() =>
    act({
      action: "appointment",
      appointmentId: job.job!.appointments[0].id,
      status: "Done",
    }),
  ).toThrow();
  act({
    action: "appointment",
    appointmentId: job.job!.appointments[0].id,
    status: "Dispatched",
  });
  act({
    action: "appointment",
    appointmentId: job.job!.appointments[0].id,
    status: "Arrived",
  });
  for (const form of jobOperations(job).forms) {
    expect(() =>
      act({
        action: "save-form",
        formId: form.id,
        answers: {},
        complete: true,
      }),
    ).toThrow();
    const answers = Object.fromEntries(
      form.questions.map((question) => [question.id, "Confirmed on site"]),
    );
    act({ action: "save-form", formId: form.id, answers, complete: false });
    expect(job.job!.forms.find((item) => item.id === form.id)!.status).toBe(
      "Started",
    );
    act({ action: "save-form", formId: form.id, answers, complete: true });
  }
  const appointmentId = job.job!.appointments[0].id;
  for (const status of ["Paused", "Dispatched", "Arrived", "Done"] as const)
    act({ action: "appointment", appointmentId, status });
  act({
    action: "invoice",
    summary: "Work completed and site cleaned.",
    paymentTerms: "On account",
    paymentNotes: "Balance due in 30 days.",
  });
  act({
    action: "acknowledge",
    signatureKind: "authorization",
    name: "Customer",
    consent: true,
    document: authorizationDocument(job, workspace.scope),
  });
  act({ action: "finalize" });
  expect(() =>
    act({
      action: "acknowledge",
      name: "Customer",
      consent: true,
      document: "stale",
    }),
  ).toThrow("changed");
  act({
    action: "acknowledge",
    name: "Customer",
    consent: true,
    document: invoiceDocument(job, workspace.scope),
  });
  act({ action: "reopen" });
  expect(job.job!.invoice.acknowledgement).toBeUndefined();
  act({ action: "finalize" });
  act({
    action: "acknowledge",
    name: "Customer",
    consent: true,
    document: invoiceDocument(job, workspace.scope),
  });
  act({
    action: "add-appointment",
    title: "Duplicate visit",
    date: "2026-11-20",
    start: "09:00",
    end: "10:00",
    technician: "Alex",
  });
  act({
    action: "cancel-appointment",
    appointmentId: "new-id",
    reason: "Entered twice",
  });
  expect(job.job!.appointments[1].cancellationReason).toBe("Entered twice");
  workspace.tasks = workspace.tasks.map((task) => ({
    ...task,
    status: "Done",
  }));
  workspace.quotes = [];
  expect(closeoutIssues(job, workspace)).toEqual([]);
  act({ action: "complete" });
  expect(job.status).toBe("Completed");
  expect(() => act({ action: "reopen" })).toThrow("Reopen the job");
});

test("job operations endpoints require authentication", async ({ request }) => {
  expect(
    (
      await request.post(
        "/api/jobs/994b20d1-54dd-47fa-9fb2-8a6651c647b1/actions",
        {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "complete" },
        },
      )
    ).status(),
  ).toBe(401);
});

test("booking preserves estimate identity, copies billable scope once and credits the existing deposit", async () => {
  const db = new PGlite();
  const org = "11111111-1111-4111-8111-111111111111";
  const actor = "22222222-2222-4222-8222-222222222222";
  const jobId = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role; create table public.remodel_records(id uuid primary key,organization_id uuid,kind text,project_id uuid,created_by uuid,updated_by uuid,updated_at timestamptz,data jsonb);`,
    );
    const migration = await readFile(
      "supabase/migrations/202611190001_job_operations.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const workspace = jobWorkspaceDemo();
    const version = "2026-11-18T12:00:00.000Z";
    const job = { ...workspace.projects[0], id: jobId, updatedAt: version };
    const sold = {
      ...workspace.quotes!.find((quote) => quote.status === "Accepted")!,
      jobId,
      updatedAt: version,
    };
    const insert = async (
      kind: string,
      data: Record<string, unknown>,
      parent: string | null = null,
    ) =>
      db.query(
        `insert into public.remodel_records values($1,$2,$3,$4,$5,$5,$6,$7)`,
        [data.id, org, kind, parent, actor, version, JSON.stringify(data)],
      );
    await insert("project", job);
    await insert("quote", sold);
    const sourceLines = workspace.scope.filter(
      (item) => item.projectId === sold.id,
    );
    for (const [index, item] of sourceLines.entries())
      await insert(
        "scope",
        { ...item, id: `44444444-4444-4444-8444-44444444444${index}` },
        sold.id,
      );
    const deposit = {
      ...workspace.activities![0],
      id: "55555555-5555-4555-8555-555555555555",
    };
    await insert("activity", deposit, sold.id);
    await expect(
      db.query(
        `update public.remodel_records set data=jsonb_set(data,'{status}','"Completed"') where id=$1`,
        [jobId],
      ),
    ).rejects.toThrow("Closeout");
    const call = (
      organization: string,
      expected: string,
      booking = true,
      next = job,
    ) =>
      db.query<{ result: typeof job }>(
        `select public.remodel_save_job_operation($1,$2,$3,$4,$5,false,$6,$7) as result`,
        [
          organization,
          actor,
          jobId,
          expected,
          JSON.stringify(next),
          booking ? sold.id : null,
          booking ? version : null,
        ],
      );
    await expect(
      call("66666666-6666-4666-8666-666666666666", version),
    ).rejects.toThrow("unavailable");
    await expect(call(org, "2020-01-01T00:00:00Z")).rejects.toThrow("changed");
    await expect(
      db.query(`update public.remodel_records set kind='project' where id=$1`, [
        sold.id,
      ]),
    ).rejects.toThrow("retain their identity");
    const first = await call(org, version);
    const updated = first.rows[0].result;
    expect(
      (
        await db.query<{ kind: string }>(
          `select kind from public.remodel_records where id=$1`,
          [sold.id],
        )
      ).rows[0].kind,
    ).toBe("quote");
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::integer n from public.remodel_records where project_id=$1 and kind='scope'`,
          [jobId],
        )
      ).rows[0].n,
    ).toBe(sourceLines.length);
    const payments = await db.query<{ data: typeof deposit }>(
      `select data from public.remodel_records where kind='activity'`,
    );
    expect(payments.rows[0].data.invoiceJobId).toBe(jobId);
    await call(org, updated.updatedAt, true, updated);
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::integer n from public.remodel_records where project_id=$1 and kind='scope'`,
          [jobId],
        )
      ).rows[0].n,
    ).toBe(sourceLines.length);
    const finalized = {
      ...updated,
      job: {
        ...jobOperations(updated),
        invoice: {
          ...jobOperations(updated).invoice,
          status: "Finalized" as const,
          summary: "Completed work",
        },
      },
    };
    const savedFinal = (await call(org, updated.updatedAt, false, finalized))
      .rows[0].result;
    await expect(
      db.query(
        `update public.remodel_records set data=jsonb_set(data,'{estimate}','123') where project_id=$1 and kind='scope'`,
        [jobId],
      ),
    ).rejects.toThrow("Reopen the invoice");
    await expect(
      db.query(
        `update public.remodel_records set data=jsonb_set(data,'{job,invoice,summary}','"forged"') where id=$1`,
        [jobId],
      ),
    ).rejects.toThrow("operations endpoint");
    const billedScope = (
      await db.query<{ data: (typeof sourceLines)[number] }>(
        `select data from public.remodel_records where kind='scope' and project_id=$1`,
        [jobId],
      )
    ).rows.map((row) => row.data);
    const closeable = {
      ...savedFinal,
      status: "Completed" as const,
      completedDate: "2026-11-19",
      job: jobOperations(savedFinal),
    };
    closeable.job.forms = closeable.job.forms.map((form) => ({
      ...form,
      status: "Complete",
      questions: form.questions.map((q) => ({ ...q, answer: "Confirmed" })),
    }));
    closeable.job.appointments = closeable.job.appointments.map((appt) => ({
      ...appt,
      status: "Done",
    }));
    closeable.job.invoice.paymentTerms = "On account";
    closeable.job.invoice.paymentNotes = "Net 30, agreed with customer";
    closeable.job.invoice.authorization = {
      name: closeable.client,
      at: version,
      capturedBy: "Staff",
      document: authorizationDocument(closeable, billedScope),
    };
    closeable.job.invoice.acknowledgement = {
      name: closeable.client,
      at: version,
      capturedBy: "Staff",
      document: invoiceDocument(closeable, billedScope),
    };
    const finish = (data = closeable) =>
      db.query(
        `select public.remodel_save_job_operation($1,$2,$3,$4,$5,true,null,null) result`,
        [org, actor, jobId, savedFinal.updatedAt, JSON.stringify(data)],
      );
    const taskId = "77777777-7777-4777-8777-777777777777";
    await insert(
      "task",
      { id: taskId, projectId: jobId, status: "To do" },
      jobId,
    );
    await expect(finish()).rejects.toThrow("remaining appointments and work");
    await db.query(
      `update public.remodel_records set data=jsonb_set(data,'{status}','"Done"') where id=$1`,
      [taskId],
    );
    const stale = structuredClone(closeable);
    stale.job.invoice.acknowledgement!.document = "{}";
    await expect(finish(stale)).rejects.toThrow("current invoice");
    await finish();
    await expect(
      insert(
        "task",
        {
          id: "88888888-8888-4888-8888-888888888888",
          projectId: jobId,
          status: "To do",
        },
        jobId,
      ),
    ).rejects.toThrow("Reopen the job");
    const acl = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('authenticated','public.remodel_save_job_operation(uuid,uuid,uuid,timestamptz,jsonb,boolean,uuid,timestamptz)','EXECUTE') allowed`,
    );
    expect(acl.rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
});

test("jobs contain multiple estimate options, forms, a real invoice and persistent appointments on phones", async ({
  page,
}) => {
  await page.goto("/demo?scenario=job-workspace&view=Projects");
  await expect(page.getByTestId("job-card")).toHaveCount(6);
  await page
    .getByRole("heading", { name: "Oakwood kitchen remodel", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Job navigation" });
  await nav.getByRole("button", { name: "Estimates", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Job estimates" }),
  ).toContainText("Essential kitchen refresh");
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText("Total costs");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Essential kitchen refresh",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Remove estimate", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Job estimates" }),
  ).not.toContainText("Essential kitchen refresh");
  await page
    .getByRole("button", { name: "Book to this job", exact: true })
    .click();
  await expect(page.getByText("Sold · Booked", { exact: true })).toBeVisible();
  await page.reload();
  await nav.getByRole("button", { name: "Estimates", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Book to this job", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Dispatch", exact: true }).click();
  await page.getByRole("button", { name: "Arrive", exact: true }).click();
  await nav.getByRole("button", { name: "Forms", exact: true }).click();
  await page
    .getByRole("button", { name: /Arrival checklist Required/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").nth(0).fill("Confirmed with customer");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("region", { name: "Job forms" })).toContainText(
    "Started",
  );
  await page
    .getByRole("button", { name: /Arrival checklist Required/ })
    .click();
  await expect(dialog.getByRole("textbox").nth(0)).toHaveValue(
    "Confirmed with customer",
  );
  await dialog
    .getByRole("textbox")
    .nth(1)
    .fill("Floors protected and existing conditions recorded");
  await dialog.getByRole("button", { name: "Complete form" }).click();
  await nav.getByRole("button", { name: "Invoice", exact: true }).click();
  await expect(page.getByRole("region", { name: "Job invoice" })).toContainText(
    "$42,000.00",
  );
  await expect(
    page.getByRole("region", { name: "Checks & payments" }),
  ).toContainText("$8,400.00");
  await page
    .getByLabel("Invoice summary · work performed")
    .fill("Kitchen installation completed.");
  await page
    .getByLabel("Payment terms", { exact: true })
    .selectOption("On account");
  await page
    .getByLabel("Payment / account notes")
    .fill("Remaining balance due in 30 days.");
  await page
    .getByRole("button", { name: "Finalize invoice", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await dialog.getByLabel("Customer printed signature").fill("Miller Customer");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Sign invoice", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Customer invoice acknowledgement/ })
    .click();
  await dialog.getByLabel("Customer printed signature").fill("Miller Customer");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Sign invoice", exact: true })
    .click();
  await nav.getByRole("button", { name: "Closeout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Complete job", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Complete Completion checklist/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Complete Completion checklist/ })
    .click();
  await page
    .getByRole("button", { name: /Completion checklist Required/ })
    .click();
  await dialog.getByRole("textbox").nth(0).fill("Installed and cleaned");
  await dialog
    .getByRole("textbox")
    .nth(1)
    .fill("Walkthrough complete, no concerns");
  await dialog
    .getByRole("button", { name: "Complete form", exact: true })
    .click();
  await nav.getByRole("button", { name: "Schedule", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete appointment", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  for (const title of [
    "Confirm countertop template",
    "Install LVP flooring",
    "Schedule final walkthrough",
  ])
    await page
      .getByRole("button", { name: `Complete ${title}`, exact: true })
      .click();
  await nav.getByRole("button", { name: "Closeout", exact: true }).click();
  await page.getByRole("button", { name: "Complete job", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Confirm job completion", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Project status", { exact: true })).toHaveValue(
    "Completed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of [
    "Job",
    "Estimates",
    "Forms",
    "Invoice",
    "Schedule",
    "Closeout",
  ]) {
    await nav.getByRole("button", { name: section, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
