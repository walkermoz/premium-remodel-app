import { expect, test } from "@playwright/test";
import { jobWorkspaceDemo } from "../lib/demo-job-workspace";
import { jobRecords, nextJobTask, sameJobCustomer } from "../lib/job-workspace";

test("job history never associates different contacts using a shared name or address", () => {
  const workspace = jobWorkspaceDemo();
  const record = workspace.projects[0];
  expect(
    sameJobCustomer(record, {
      ...record,
      id: "different",
      client: record.client,
      address: "Different address",
      clientEmail: "other@example.com",
    }),
  ).toBe(false);
  expect(
    sameJobCustomer(
      { ...record, contactId: "contact-one" },
      { ...record, id: "different", contactId: "contact-two" },
    ),
  ).toBe(false);
  expect(
    sameJobCustomer(record, {
      ...record,
      id: "different",
      clientEmail: record.clientEmail?.toUpperCase(),
    }),
  ).toBe(true);
  workspace.quotes![0].junkedAt = new Date().toISOString();
  expect(jobRecords(workspace).every((entry) => entry.kind !== "quote")).toBe(
    true,
  );
  expect(
    jobRecords(workspace, true).some((entry) => entry.kind === "quote"),
  ).toBe(true);
  const tasks = workspace.tasks.filter((task) => task.projectId === record.id);
  const next = nextJobTask(tasks, "2000-01-01");
  expect(next?.status).not.toBe("Done");
});

test("one job workspace keeps estimate editing, notes, payments, and closeout accessible", async ({
  page,
}) => {
  await page.goto("/demo?scenario=job-workspace&view=Projects");
  await expect(
    page.getByRole("heading", { name: "All jobs", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("job-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Estimating", exact: true }).click();
  await expect(page.getByTestId("job-card")).toHaveCount(1);
  await page
    .getByRole("heading", { name: "Cary kitchen renovation", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Job navigation" });
  await expect(
    nav.getByRole("button", { name: "Estimates", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Items, costs & pricing" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  const input = page.getByRole("textbox", { name: "New job note" });
  await input.fill("Keep the appliance sizes in the final cabinet plan.");
  await nav.getByRole("button", { name: "Job", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Service address" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(input).toHaveValue(
    "Keep the appliance sizes in the final cabinet plan.",
  );
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.reload();
  await nav.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Job notes", exact: true }),
  ).toContainText("Keep the appliance sizes in the final cabinet plan.");
  await page.getByRole("button", { name: "All jobs", exact: true }).click();
  await page
    .getByRole("heading", { name: "Oakwood kitchen remodel", exact: true })
    .click();
  await nav.getByRole("button", { name: "Invoice", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Checks & payments" }),
  ).toContainText("$24,250.00");
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page
      .locator(".job-activity-entry")
      .filter({ hasText: "Initial project payment" }),
  ).toHaveCount(1);
  await nav.getByRole("button", { name: "Closeout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Complete job", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Job closeout" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await nav.getByRole("button", { name: "Job", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Arrival window" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
