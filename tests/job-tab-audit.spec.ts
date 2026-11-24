import { expect, test } from "@playwright/test";
import { jobWorkspaceDemo } from "../lib/demo-job-workspace";
import { nextJobVisit } from "../lib/job-workspace";
import { calendarEntries } from "../lib/calendar";
import { entryTiming, entryType, workToday } from "../lib/work";
import {
  applyJobAction,
  jobOperations,
  closeoutIssues,
} from "../lib/job-operations";

test("job overview and shared calendars use the same appointment dates and statuses", () => {
  const workspace = jobWorkspaceDemo();
  const job = workspace.projects[0];
  const visit = job.job!.appointments[0];
  visit.date = "2026-12-10";
  const task = {
    ...workspace.tasks[0],
    projectId: job.id,
    status: "To do" as const,
    dueDate: "2026-12-02",
  };
  expect(nextJobVisit(job, [task], "2026-12-01")!.id).toBe(task.id);
  const entries = calendarEntries(workspace, job.id, true);
  const entry = entries.find((entry) => entry.jobAppointment?.id === visit.id)!;
  expect(entry.date).toBe("2026-12-10");
  expect(entryType(entry)).toBe("Contractor visit");
  expect(entryTiming(entry)).toContain("–");
  visit.status = "Canceled";
  expect(
    calendarEntries(workspace).some(
      (entry) => entry.jobAppointment?.id === visit.id,
    ),
  ).toBe(false);
  visit.status = "Done";
  expect(
    calendarEntries(workspace).some(
      (entry) => entry.jobAppointment?.id === visit.id,
    ),
  ).toBe(false);
  expect(
    calendarEntries(workspace, "", true).some(
      (entry) => entry.jobAppointment?.id === visit.id,
    ),
  ).toBe(true);
});

test("rescheduling retains identity, rejects started visits and prevents overlapping crew assignments", () => {
  const workspace = jobWorkspaceDemo();
  const original = workspace.projects[0];
  const id = original.job!.appointments[0].id;
  const action = {
    action: "reschedule-appointment" as const,
    appointmentId: id,
    date: "2026-12-01",
    start: "10:00",
    end: "11:00",
    reason: "Customer requested a later visit",
  };
  const update = applyJobAction(
    original,
    workspace,
    action,
    { name: "Alex" },
    new Date().toISOString(),
    "unused",
  );
  expect(update.job!.appointments).toHaveLength(1);
  expect(update.job!.appointments[0]).toMatchObject({ id, date: action.date });
  expect(update.job!.history[0].detail).toContain(action.reason);
  const started = structuredClone(original);
  started.job!.appointments[0].status = "Dispatched";
  expect(() =>
    applyJobAction(
      started,
      workspace,
      action,
      { name: "Alex" },
      new Date().toISOString(),
      "unused",
    ),
  ).toThrow("scheduled visit");
  const another = { ...original, id: "other-job", job: jobOperations(update) };
  another.job.appointments[0].id = "other-visit";
  workspace.projects.push(another);
  expect(() =>
    applyJobAction(
      original,
      workspace,
      action,
      { name: "Alex" },
      new Date().toISOString(),
      "unused",
    ),
  ).toThrow("already has");
  expect(() =>
    applyJobAction(
      original,
      workspace,
      { ...action, start: "11:00", end: "12:00" },
      { name: "Alex" },
      new Date().toISOString(),
      "unused",
    ),
  ).not.toThrow();
});

test("closeout treats a zero-price item as real scope while rejecting truly empty estimates", () => {
  const workspace = jobWorkspaceDemo();
  const job = workspace.projects[0];
  const quote = { ...workspace.quotes![0], id: "empty-option", jobId: job.id };
  workspace.quotes = [quote];
  expect(
    closeoutIssues(job, workspace).some((issue) =>
      issue.title.includes("empty estimate"),
    ),
  ).toBe(true);
  workspace.scope.push({
    ...workspace.scope[0],
    id: "zero-line",
    projectId: quote.id,
    estimate: 0,
  });
  expect(
    closeoutIssues(job, workspace).some((issue) =>
      issue.title.includes("empty estimate"),
    ),
  ).toBe(false);
});

test("all job tabs expose the correct records, history scope, invoice print and rescheduling actions", async ({
  page,
}) => {
  const workspace = jobWorkspaceDemo();
  const job = workspace.projects[0];
  const prior = {
    ...job,
    id: "prior-location-job",
    name: "Prior roof repair",
    job: jobOperations(job),
    status: "Completed" as const,
  };
  prior.job.forms[0].status = "Complete";
  prior.job.forms[0].questions[0].answer = "Historical roof conditions";
  prior.job.forms[0].completedAt = new Date().toISOString();
  prior.job.forms[0].completedBy = "Alex";
  const other = {
    ...prior,
    id: "other-location-job",
    name: "Other property repair",
    address: "600 Different Avenue, Raleigh, NC",
  };
  workspace.projects.push(prior, other);
  workspace.comments.push({
    ...workspace.comments[0],
    id: "prior-note",
    projectId: prior.id,
    body: "Prior roof note",
    authorName: "Alex",
  });
  const expired = {
    ...workspace.quotes![0],
    id: "expired-option",
    name: "Expired kitchen option",
    status: "Expired" as const,
  };
  workspace.quotes!.push(expired);
  workspace.scope.push({
    ...workspace.scope[0],
    id: "expired-line",
    projectId: expired.id,
  });
  await page.addInitScript((data) => {
    if (!localStorage.getItem("premium-remodel-job-workspace-v2"))
      localStorage.setItem(
        "premium-remodel-job-workspace-v2",
        JSON.stringify(data),
      );
  }, workspace);
  await page.goto(
    `/demo?scenario=job-workspace&view=Projects&project=${job.id}`,
  );
  const nav = page.getByRole("navigation", { name: "Job navigation" });
  await expect(
    page.getByRole("heading", { name: job.name, exact: true }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("region", {
    name: "Job history",
    exact: true,
  });
  await expect(history).toContainText("Prior roof repair");
  await expect(history).not.toContainText("Other property repair");
  await page.getByLabel("History scope").selectOption("Customer");
  await expect(history).toContainText("Other property repair");
  await page
    .getByRole("group", { name: "History category" })
    .getByRole("button", { name: "Forms", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Arrival checklist Prior roof repair/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Historical roof conditions",
  );
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("group", { name: "History category" })
    .getByRole("button", { name: "Notes", exact: true })
    .click();
  await expect(history).toContainText("Prior roof note");
  await nav.getByRole("button", { name: "Estimates", exact: true }).click();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Expired kitchen option",
  );
  await expect(page.getByRole("dialog")).not.toContainText("Total costs");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Book to this job", exact: true })
    .click();
  await nav.getByRole("button", { name: "Forms", exact: true }).click();
  await page
    .getByRole("button", { name: "Services agreement & signatures" })
    .click();
  await expect(
    page.getByRole("region", { name: "Booked agreements" }),
  ).toContainText("Signed services agreement");
  await nav.getByRole("button", { name: "Invoice", exact: true }).click();
  await page.getByRole("button", { name: "Print / save PDF" }).click();
  const invoice = page.getByTestId("customer-invoice-document");
  await expect(invoice).toContainText("$42,000.00");
  await expect(invoice).toContainText("$8,400.00");
  await expect(invoice).not.toContainText("Subcontractor cost");
  await page.evaluate(() => {
    const original = window.open.bind(window);
    window.open = (...args) => {
      const opened = original(...args);
      if (opened)
        opened.print = () => {
          opened.document.documentElement.dataset.printRequested = "true";
        };
      return opened;
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Print or save as PDF", exact: true })
    .click();
  const printed = await popupPromise;
  await expect(printed.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
  );
  await expect(printed.locator("body")).toContainText("$42,000.00");
  await expect(printed.locator("body")).not.toContainText("Budgeted costs");
  await printed.close();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByLabel("Invoice summary · work performed")
    .fill("Installed approved kitchen scope");
  await page
    .getByRole("button", { name: "Finalize invoice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit invoice items", exact: true }),
  ).toBeDisabled();
  await page.goto(
    `/demo?scenario=job-workspace&view=Projects&project=${job.id}&tab=Scope+%26+costs`,
  );
  await expect(
    page.getByRole("region", { name: "Locked invoice items" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeDisabled();
  await nav.getByRole("button", { name: "Schedule", exact: true }).click();
  await page
    .getByRole("button", { name: "Reschedule appointment", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = workToday(tomorrow);
  await dialog.getByLabel("Date", { exact: true }).fill(date);
  await dialog
    .getByLabel("Reason for rescheduling")
    .fill("Customer asked to move the visit");
  await dialog.getByRole("button", { name: "Confirm reschedule" }).click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Job appointments" }),
  ).toContainText("Scheduled");
  await page
    .getByRole("group", { name: "Upcoming view" })
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project calendar", exact: true }),
  ).toContainText("Measure & selections visit");
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await page
    .getByLabel("New job note")
    .fill("Keep the driveway clear for delivery");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Job notes" })).toContainText(
    "Keep the driveway clear for delivery",
  );
  await nav
    .getByRole("button", { name: "Photos & files", exact: true })
    .click();
  await page.locator('.files-panel input[type="file"]').setInputFiles({
    name: "job-evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Site walkthrough"),
  });
  await expect(page.locator(".files-panel")).toContainText("job-evidence.txt");
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("group", { name: "History category" })
    .getByRole("button", { name: "Job activity", exact: true })
    .click();
  await expect(history).toContainText("Customer asked to move the visit");
  await expect(history).toContainText("$8,400.00");
  await expect(history).toContainText("Uploaded job-evidence.txt");
  await nav.getByRole("button", { name: "Closeout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Complete job", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "Job",
    "History",
    "Forms",
    "Estimates",
    "Invoice",
    "Schedule",
    "Notes",
    "Photos & files",
    "Closeout",
  ]) {
    await nav.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("a legacy job agreement remains visible when another estimate has been booked", async ({
  page,
}) => {
  const workspace = jobWorkspaceDemo();
  const job = workspace.projects[0];
  const sold = workspace.quotes!.find((quote) => quote.status === "Accepted")!;
  sold.bookedJobId = job.id;
  job.quoteAcceptedAt = sold.quoteAcceptedAt || new Date().toISOString();
  job.acceptedQuoteScope = sold.acceptedQuoteScope;
  job.msaAgreement = sold.msaAgreement;
  await page.addInitScript(
    (data) =>
      localStorage.setItem(
        "premium-remodel-job-workspace-v2",
        JSON.stringify(data),
      ),
    workspace,
  );
  await page.goto(
    `/demo?scenario=job-workspace&view=Projects&project=${job.id}&tab=Contracts`,
  );
  await page
    .getByRole("button", {
      name: "Services agreement & signatures",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Booked agreements", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Master services agreement",
      exact: true,
    }),
  ).toBeVisible();
});
