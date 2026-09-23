import { test, expect } from "@playwright/test";
import { activityTotals } from "../lib/activity";
import { schemas } from "../lib/schemas";
import type { Activity } from "../lib/types";

test("payment validation and totals preserve cents and exclude nonpayment work", () => {
  const entry = {
    projectId: "p1",
    activityType: "Payment received",
    actorId: "demo",
    occurredAt: new Date().toISOString(),
    summary: "Flooring",
    party: "Scott",
    amount: 100.15,
  };
  expect(schemas.activity.safeParse(entry).success).toBe(true);
  for (const amount of [-1, 0, 1.555, null])
    expect(schemas.activity.safeParse({ ...entry, amount }).success).toBe(
      false,
    );
  expect(schemas.activity.safeParse({ ...entry, party: "" }).success).toBe(
    false,
  );
  expect(
    schemas.activity.safeParse({
      ...entry,
      activityType: "Materials delivered",
    }).success,
  ).toBe(false);
  expect(
    schemas.activity.safeParse({ ...entry, activityType: "Work completed" })
      .success,
  ).toBe(false);
  expect(
    activityTotals([
      { ...entry, amount: 0.1 },
      { ...entry, amount: 0.2 },
      { ...entry, activityType: "Subcontractor paid", amount: 20.51 },
    ] as Activity[]),
  ).toEqual({ received: 0.3, paid: 20.51 });
});

test("log payments and deliveries, attach receipts, filter and show project payment totals", async ({
  page,
}) => {
  await page.goto("/demo?view=Activity");
  await expect(page.getByRole("heading", { name: "Activity." })).toBeVisible();
  const dialog = page.getByRole("dialog");
  const log = async (
    type: string,
    project: string,
    summary: string,
    amount?: string,
  ) => {
    await page
      .getByRole("button", { name: "Log activity", exact: true })
      .click();
    await dialog
      .getByRole("combobox", { name: "Project", exact: true })
      .selectOption(project);
    await dialog
      .getByRole("combobox", { name: "Activity type" })
      .selectOption(type);
    await dialog
      .getByRole("combobox", { name: "Who did it?" })
      .selectOption("demo-jordan");
    await dialog.getByLabel("What was it for?").fill(summary);
    if (amount) {
      await dialog.getByLabel("Amount ($)").fill(amount);
      await dialog
        .getByLabel(type === "Payment received" ? "Received from" : "Paid to", {
          exact: true,
        })
        .fill(type === "Payment received" ? "Scott" : "Framing subcontractor");
    }
  };
  await log("Payment received", "p1", "Flooring payment", "3000.15");
  await dialog.getByLabel("Activity attachments").setInputFiles({
    name: "check-receipt.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Sample payment receipt"),
  });
  await page.screenshot({
    path: "test-results/activity-form-desktop.png",
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Log activity", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Jordan Lee received $3,000.15 from Scott",
    }),
  ).toBeVisible();
  await expect(page.getByText("Logged by Alex Morgan")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "check-receipt.txt" }),
  ).toBeVisible();
  await log("Subcontractor paid", "p1", "Framing labor", "2000");
  await dialog
    .getByRole("button", { name: "Log activity", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await log("Materials delivered", "p2", "Lumber for Jason's garage");
  await dialog.getByLabel("Delivered to (optional)").fill("Jason");
  await dialog
    .getByRole("button", { name: "Log activity", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByLabel("Filter activity by project").selectOption("p1");
  await expect(page.getByText("Lumber for Jason's garage")).toHaveCount(0);
  await page
    .getByLabel("Filter activity by type")
    .selectOption("Payment received");
  await expect(page.locator(".job-activity-entry")).toHaveCount(1);
  await page.locator(".job-activity-context .text-button").click();
  await expect(page.getByRole("tab", { name: /^Activity/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const totals = page.getByLabel("Logged project payments");
  await expect(totals).toContainText("$3,000.15");
  await expect(totals).toContainText("$2,000.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/activity-project-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .locator(".job-activity-entry")
    .filter({ hasText: "Flooring payment" })
    .getByRole("button", { name: "Delete activity" })
    .click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(totals).toContainText("$0.00");
  await page.getByRole("tab", { name: /^Photos & files/ }).click();
  await expect(page.getByText("check-receipt.txt")).toBeVisible();
});

test("completed work logs once per completion and retains history when reopened", async ({
  page,
}) => {
  await page.goto("/demo?view=Upcoming&layout=List");
  const complete = page.getByRole("button", { name: /^Complete / }).first();
  const title = (await complete.getAttribute("aria-label"))!.replace(
    /^Complete /,
    "",
  );
  await complete.click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Activity", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("region", { name: "Latest activity" })
    .getByRole("button", { name: "View all activity" })
    .click();
  await page
    .getByLabel("Filter activity by type")
    .selectOption("Work completed");
  await expect(page.locator(".job-activity-entry")).toHaveCount(1);
  await expect(page.locator(".job-activity-entry")).toContainText(title);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: /^Upcoming/ })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Work status" })
    .selectOption("Completed");
  await page
    .getByRole("button", { name: `Reopen ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("region", { name: "Latest activity" })
    .getByRole("button", { name: "View all activity" })
    .click();
  await page
    .getByLabel("Filter activity by type")
    .selectOption("Work completed");
  await expect(page.locator(".job-activity-entry")).toHaveCount(1);
  await page.goto("/demo?view=Projects&project=p1&tab=Updates");
  await expect(page.getByRole("tab", { name: /^Activity/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
