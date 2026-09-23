import { test, expect } from "@playwright/test";
import { projectFinances, scopeDifference } from "../lib/project-finances";
import { readFile } from "node:fs/promises";
import {
  emptyWorkspace,
  type Activity,
  type Project,
  type ScopeItem,
} from "../lib/types";
const base = {
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};
const project: Project = {
  ...base,
  id: "p1",
  name: "Payment test job",
  client: "Scott",
  address: "",
  description: "",
  category: "Kitchen",
  cover: "",
  startDate: "",
  endDate: "",
  status: "Planning",
  contractPrice: 1000,
};
const scope: ScopeItem = {
  ...base,
  id: "s1",
  projectId: "p1",
  title: "Flooring",
  quantity: 1,
  unit: "job",
  estimate: 600,
  subCost: 200,
  contractorId: "",
  status: "To do",
};
const payment: Activity = {
  ...base,
  id: "a1",
  projectId: "p1",
  activityType: "Payment received",
  actorId: "demo",
  actorName: "Alex",
  authorId: "demo",
  authorName: "Alex",
  occurredAt: base.createdAt,
  summary: "Deposit",
  notes: "",
  amount: 150,
  party: "Scott",
  paymentMethod: "Check",
  attachmentIds: [],
  contractorId: "",
};

test("scope is the price; cents, credits, zero totals, and unrelated payments are handled", () => {
  const result = projectFinances(
    project,
    [scope],
    [
      payment,
      { ...payment, id: "a2", projectId: "other", amount: 4000 },
      { ...payment, id: "a3", activityType: "Subcontractor paid", amount: 200 },
    ],
  );
  expect(result).toMatchObject({
    total: 600,
    costs: 200,
    margin: 400,
    collected: 150,
    remaining: 450,
    collectedPercent: 0.25,
    remainingPercent: 0.75,
    legacyDifference: -400,
  });
  expect(result.payments).toHaveLength(1);
  expect(
    projectFinances(
      project,
      [{ ...scope, estimate: 0.3 }],
      [
        { ...payment, amount: 0.1 },
        { ...payment, id: "a2", amount: 0.2 },
      ],
    ),
  ).toMatchObject({
    total: 0.3,
    collected: 0.3,
    remaining: 0,
    credit: 0,
    collectedPercent: 1,
  });
  expect(
    projectFinances(project, [scope], [{ ...payment, amount: 700 }]),
  ).toMatchObject({
    collected: 700,
    remaining: 0,
    credit: 100,
    remainingPercent: 0,
  });
  expect(projectFinances(project, [], [payment])).toMatchObject({
    collectedPercent: null,
    remainingPercent: null,
    remaining: 0,
  });
});

test("material costs reduce margin without changing customer pricing or collections", () => {
  const items = [
    { ...scope, estimate: 600.35, subCost: 200.1, materialCost: 150.25 },
    { ...scope, id: "s2", estimate: 100, subCost: 20 },
    { ...scope, id: "foreign", projectId: "other", materialCost: 90000 },
  ];
  expect(projectFinances(project, items, [payment])).toMatchObject({
    total: 700.35,
    subCosts: 220.1,
    materialCosts: 150.25,
    costs: 370.35,
    margin: 330,
    marginPercent: 33000 / 70035,
    collected: 150,
    remaining: 550.35,
  });
  expect(scopeDifference(items[0])).toBe(250);
  expect(
    scopeDifference({
      ...scope,
      estimate: 0.3,
      subCost: 0.1,
      materialCost: 0.2,
    }),
  ).toBe(0);
  expect(
    projectFinances(project, [{ ...scope, materialCost: 500 }]),
  ).toMatchObject({
    costs: 700,
    margin: -100,
    marginPercent: -1 / 6,
  });
});

test("material costs edit, persist, total and export on existing scope items", async ({
  page,
}) => {
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem("premium-remodel-sample-v1"))
        localStorage.setItem("premium-remodel-sample-v1", JSON.stringify(data));
    },
    { ...emptyWorkspace, projects: [project], scope: [scope] },
  );
  await page.goto("/demo?view=Projects&project=p1");
  const table = page.locator(".scope-table");
  await expect(
    table.getByRole("columnheader", { name: "Material cost", exact: true }),
  ).toBeVisible();
  await expect(table.locator("tbody td").nth(4)).toHaveText("$0");
  await table
    .getByRole("button", { name: "Edit Flooring", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Material cost · total ($)")).toHaveValue("0");
  await dialog.getByLabel("Material cost · total ($)").fill("150.25");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(table.locator("tfoot td").nth(3)).toHaveText("$150.25");
  await expect(table.locator("tfoot td").nth(4)).toHaveText("$249.75");
  const metrics = page.locator(".scope-metrics");
  await expect(metrics).toContainText("$350.25");
  await expect(metrics).toContainText("Materials · $150.25");
  await expect(metrics.locator(".metric-percentage")).toHaveText("41.6%");
  await expect(
    page
      .getByRole("region", { name: "Checks & payments" })
      .locator(".payment-balance-grid"),
  ).toContainText("$600");
  await page.reload();
  await table
    .getByRole("button", { name: "Edit Flooring", exact: true })
    .click();
  await expect(dialog.getByLabel("Material cost · total ($)")).toHaveValue(
    "150.25",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export sheet", exact: true }).click();
  const file = await downloaded;
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain('"Subcontractor cost","Material cost","Difference"');
  expect(csv).toContain('"Flooring","1","job","600","200","150.25","249.75"');
  expect(csv).toContain('"TOTAL","","","600","200","150.25","249.75"');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: /Scope & costs/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await table
    .getByRole("button", { name: "Edit Flooring", exact: true })
    .click();
  await expect(dialog.getByLabel("Material cost · total ($)")).toBeVisible();
  await dialog.getByLabel("Material cost · total ($)").fill("0");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(metrics.locator(".metric-percentage")).toHaveText("66.7%");
});

test("project overview logs checks and updates the balance, preserving the price warning through edits", async ({
  page,
}) => {
  await page.addInitScript(
    (data) =>
      localStorage.setItem("premium-remodel-sample-v1", JSON.stringify(data)),
    { ...emptyWorkspace, projects: [project], scope: [scope] },
  );
  await page.goto("/demo?view=Projects&project=p1");
  const payments = page.getByRole("region", { name: "Checks & payments" });
  await expect(payments).toContainText("$600");
  await expect(page.locator(".scope-price-warning")).toContainText(
    "$400 below the previous contract amount of $1,000",
  );
  await expect(page.locator(".detail-metrics > div")).toHaveCount(3);
  await payments.getByRole("button", { name: "Log payment" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Activity type")).toHaveValue(
    "Payment received",
  );
  await expect(dialog.getByLabel("Payment method")).toHaveValue("Check");
  await dialog.getByLabel("Amount ($)").fill("150");
  await dialog.getByLabel("What was it for?").fill("Flooring deposit");
  await dialog
    .getByRole("button", { name: "Log activity", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(payments.locator(".payment-balance-grid")).toContainText(
    "$15025%",
  );
  await expect(payments.locator(".payment-balance-grid")).toContainText(
    "$45075%",
  );
  await expect(payments).toContainText("Check from Scott");
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(dialog.locator('[name="contractPrice"]')).toHaveCount(0);
  await dialog.getByLabel("Project name").fill("Payment test updated");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".scope-price-warning")).toContainText(
    "$400 below",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(payments).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("quotes carry their contact, scope and files into a planning project", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quote name").fill("Jason’s garage quote");
  await dialog.getByLabel("Client name").fill("Jason");
  await dialog.getByLabel("Client email").fill("jason@example.com");
  await dialog.getByLabel("Client phone").fill("9195550100");
  await dialog.getByRole("button", { name: "Create quote" }).click();
  await expect(
    page.getByRole("heading", { name: "Jason’s garage quote", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await dialog.getByLabel("Work item", { exact: true }).fill("Garage framing");
  await dialog.getByLabel("Price · total ($)", { exact: true }).fill("5000.15");
  await dialog.getByLabel("Subcontractor cost · total ($)").fill("2000");
  await dialog.getByLabel("Material cost · total ($)").fill("750.15");
  await dialog.getByRole("button", { name: "Create scope item" }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator('.files-panel input[type="file"]').setInputFiles({
    name: "quote.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Test sent quote"),
  });
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.getByRole("button", { name: "Mark as sent", exact: true }).click();
  await expect(page.getByLabel("Quote status")).toHaveValue("Sent");
  await page.getByRole("button", { name: "All quotes", exact: true }).click();
  await expect(page.locator(".quote-summary")).toContainText("$5,000.15");
  await page
    .getByRole("button", { name: /Jason’s garage quote Jason/ })
    .click();
  const quoteId = new URL(page.url()).searchParams.get("project");
  await page.getByRole("button", { name: "Accept quote", exact: true }).click();
  await expect(page.getByLabel("Project status")).toHaveValue("Planning");
  expect(new URL(page.url()).searchParams.get("project")).toBe(quoteId);
  await expect(page.locator(".scope-metrics")).toContainText("$5,000.15");
  await expect(page.locator(".scope-price-warning")).toHaveCount(0);
  await expect(page.locator(".scope-table")).toContainText("Garage framing");
  await expect(page.locator(".scope-table tfoot")).toContainText("$750.15");
  await expect(page.locator(".scope-table tfoot")).toContainText("$2,250");
  await page.getByRole("tab", { name: /Photos & files/ }).click();
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.reload();
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await expect(page.locator(".quote-row")).toHaveCount(0);
});
