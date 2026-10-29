import { test, expect } from "@playwright/test";
import {
  preserveScopeCosts,
  projectFinances,
  scopeDifference,
} from "../lib/project-finances";
import { schemas } from "../lib/schemas";
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

test("cost basis metadata survives validation and older clients cannot erase it", () => {
  const item = {
    ...scope,
    subCost: 300,
    subCostUnit: "hours",
    subCostQuantity: 6,
    materialCost: 80,
    materialCostUnit: "each",
    materialCostQuantity: 4,
  };
  const legacyEdit = preserveScopeCosts(
    {
      ...item,
      estimate: 700,
      subCostUnit: undefined,
      subCostQuantity: undefined,
      materialCostUnit: undefined,
      materialCostQuantity: undefined,
    },
    item,
  );
  const saved = schemas.scope.parse(legacyEdit);
  expect(saved).toMatchObject({
    subCost: 300,
    subCostUnit: "hours",
    subCostQuantity: 6,
    materialCost: 80,
    materialCostUnit: "each",
    materialCostQuantity: 4,
  });
  expect(scopeDifference({ ...item, estimate: saved.estimate })).toBe(320);
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
  await expect(
    table
      .getByRole("button", { name: "Edit Flooring", exact: true })
      .locator("xpath=ancestor::tr")
      .locator("td")
      .nth(4),
  ).toHaveText("$0");
  await expect(
    table
      .getByRole("button", { name: "Edit Flooring", exact: true })
      .locator("xpath=ancestor::tr")
      .locator("td")
      .nth(1),
  ).toHaveText("1 job");
  await table
    .getByRole("button", { name: "Edit Flooring", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Price by")).toHaveValue("job");
  await expect(dialog.getByLabel("Number of jobs")).toHaveValue("1");
  await dialog.getByLabel("Price by").selectOption("sq ft");
  await expect(dialog.getByLabel("Total sq ft")).toBeVisible();
  await dialog.getByLabel("Price by").selectOption("job");
  await expect(dialog.getByLabel("Number of jobs")).toBeVisible();
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
  expect(csv).toContain(
    '"Project section","Work item","Scope details","Quantity","Unit","Price","Subcontractor cost","Material cost","Profit"',
  );
  expect(csv).toContain(
    '"Flooring","","1","job","600","200","150.25","249.75"',
  );
  expect(csv).toContain('"TOTAL","","","","","600","200","150.25","249.75"');
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

test("a sent quote keeps its contact, scope and files in Quotes", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Quote number")).toHaveCount(0);
  await expect(dialog.getByLabel("Revised date")).toHaveCount(0);
  await expect(dialog.getByLabel("Prepared-by phone")).toHaveCount(0);
  await expect(dialog.getByLabel("Status")).toHaveCount(0);
  await dialog.getByLabel("Quote name").fill("Jason’s garage quote");
  await dialog.getByLabel("Customer name").fill("Jason");
  await dialog.getByLabel("Email").fill("jason@example.com");
  await dialog.getByLabel("Phone").fill("9195550100");
  await dialog.getByRole("button", { name: "Create quote" }).click();
  await expect(
    page.getByRole("heading", { name: "Jason’s garage quote", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quote-header-contact")).toContainText("Jason");
  await expect(
    page.locator('.quote-header-contact a[href="mailto:jason@example.com"]'),
  ).toBeVisible();
  await expect(
    page.locator('.quote-header-contact a[href="tel:9195550100"]'),
  ).toBeVisible();
  await expect(page.locator(".quote-overview .quote-contact")).toHaveCount(0);
  await expect(
    page.locator(".quote-header-actions").getByLabel("Quote status"),
  ).toBeVisible();
  await expect(page.getByText("Quote status", { exact: true })).toHaveCount(0);
  await expect(page.locator(".quote-detail .badge-category")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", /\/api\/quotes\/[0-9a-f-]+\/pdf$/);
  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const newRow = page.locator(".scope-new-row");
  await newRow
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Garage framing");
  await newRow
    .getByLabel("Price per job for Garage framing", { exact: true })
    .fill("5000.15");
  await newRow
    .getByLabel("Subcontractor cost: Total cost for Garage framing", {
      exact: true,
    })
    .fill("2000");
  await newRow
    .getByLabel("Material cost: Total cost for Garage framing", { exact: true })
    .fill("750.15");
  await newRow.getByRole("button", { name: "Save Garage framing" }).click();
  await expect(newRow).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Garage framing" }).click();
  const savedRow = page.locator(".scope-table tbody tr").filter({
    has: page.locator('input[value="Garage framing"]'),
  });
  await savedRow.getByLabel("Price per job for Garage framing").fill("5100.15");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();
  await expect(page.locator(".scope-table tfoot")).toContainText("$5,100.15");
  const overview = page.locator(".quote-overview");
  await expect(overview.locator(".quote-overview-metric").nth(0)).toContainText(
    "$5,100.15",
  );
  await expect(overview.locator(".quote-overview-metric").nth(1)).toContainText(
    "$2,750.15",
  );
  await expect(overview.locator(".quote-overview-metric").nth(2)).toContainText(
    "$2,350",
  );
  await page.locator('.files-panel input[type="file"]').setInputFiles({
    name: "quote.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Test sent quote"),
  });
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await expect(
    page.getByRole("button", { name: "Mark as sent", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Quote status").selectOption("Sent");
  await expect(page.getByLabel("Quote status")).toHaveValue("Sent");
  await page.getByRole("button", { name: "All quotes", exact: true }).click();
  await expect(page.locator(".quote-summary")).toContainText("$5,100.15");
  await page
    .getByRole("button", { name: /Jason’s garage quote Jason/ })
    .click();
  const quoteId = new URL(page.url()).searchParams.get("project");
  await expect(page.getByRole("button", { name: "Accept quote" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Quote status")).toHaveValue("Sent");
  expect(new URL(page.url()).searchParams.get("project")).toBe(quoteId);
  await expect(
    page.getByRole("button", { name: "Edit Garage framing" }),
  ).toBeVisible();
  await expect(page.locator(".scope-table tfoot")).toContainText("$5,100.15");
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.reload();
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await expect(page.locator(".quote-row")).toContainText(
    "Jason’s garage quote",
  );
});

test("per-unit quote rates calculate and persist the line total", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quote name").fill("Hourly labor test");
  await dialog.getByLabel("Customer name").fill("Test Homeowner");
  await dialog.getByLabel("Email").fill("hourly@example.com");
  await dialog.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const row = page.locator(".scope-new-row");
  await row
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Labor");
  await expect(row.getByText("Price by", { exact: true })).toBeVisible();
  await expect(row.getByText("Number of jobs", { exact: true })).toBeVisible();
  await expect(row.getByText("Price per job", { exact: true })).toBeVisible();
  await row.getByLabel("Number of jobs for Labor").fill("3");
  await row.getByLabel("Price per job for Labor").fill("200");
  const quotePrice = row.locator(
    ".scope-inspector-totals > span:first-child strong",
  );
  await expect(quotePrice).toHaveText("$600");
  await row.getByLabel("Unit for Labor").selectOption("hours");
  await expect(row.getByLabel("Total hours for Labor")).toHaveValue("1");
  await expect(row.getByLabel("Price per hour for Labor")).toHaveValue("600");
  await row.getByLabel("Total hours for Labor").fill("2.5");
  await row.getByLabel("Price per hour for Labor").fill("80");
  await expect(quotePrice).toHaveText("$200");
  await row.getByLabel("Unit for Labor").selectOption("sq ft");
  await expect(row.getByText("Total sq ft", { exact: true })).toBeVisible();
  await expect(row.getByText("Price per sq ft", { exact: true })).toBeVisible();
  await row.getByLabel("Total sq ft for Labor").fill("250");
  await row.getByLabel("Price per sq ft for Labor").fill("250");
  await expect(quotePrice).toHaveText("$62,500");
  await row.getByLabel("Unit for Labor").selectOption("linear ft");
  await expect(row.getByText("Total linear ft", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Price per linear ft", { exact: true }),
  ).toBeVisible();
  await row.getByLabel("Unit for Labor").selectOption("each");
  await expect(row.getByText("Total items", { exact: true })).toBeVisible();
  await expect(row.getByText("Price per item", { exact: true })).toBeVisible();
  await row.getByLabel("Unit for Labor").selectOption("hours");
  await expect(row.getByText("Total hours", { exact: true })).toBeVisible();
  await expect(row.getByText("Price per hour", { exact: true })).toBeVisible();
  await row.getByLabel("Total hours for Labor").fill("2.5");
  await row.getByLabel("Price per hour for Labor").fill("80");
  await row.getByRole("button", { name: "Save Labor" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator(".scope-table tfoot")).toContainText("$200");
  await page.reload();
  await page.getByRole("button", { name: "Edit Labor" }).click();
  await expect(page.getByLabel("Price per hour for Labor")).toHaveValue("80");
  await expect(page.locator(".scope-table tfoot")).toContainText("$200");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const jobs = page.locator(".scope-new-row");
  await jobs
    .getByLabel("New work item", { exact: true })
    .fill("Permit packages");
  await jobs.getByLabel("Number of jobs for Permit packages").fill("2");
  await jobs.getByLabel("Price per job for Permit packages").fill("150");
  await expect(
    jobs.locator(".scope-inspector-totals > span:first-child strong"),
  ).toHaveText("$300");
  await jobs.getByRole("button", { name: "Save Permit packages" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Edit Permit packages" }).click();
  await expect(
    page.getByLabel("Number of jobs for Permit packages"),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Price per job for Permit packages"),
  ).toHaveValue("150");
  await expect(page.locator(".scope-table tfoot")).toContainText("$500");
});

test("quote cost bases save independent quantities and collapse to profit summary", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quote name").fill("Cost basis test");
  await dialog.getByLabel("Customer name").fill("Test Homeowner");
  await dialog.getByLabel("Email").fill("cost-basis@example.com");
  await dialog.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const row = page.locator(".scope-new-row");
  await row
    .getByLabel("New work item", { exact: true })
    .fill("Tile installation");
  await row.getByLabel("Price per job for Tile installation").fill("1000");
  await row
    .getByLabel("Subcontractor cost basis for Tile installation")
    .selectOption("sq ft");
  await row
    .getByLabel("Total sq ft for subcontractor cost of Tile installation")
    .fill("100");
  await row
    .getByLabel("Subcontractor cost: Cost per sq ft for Tile installation")
    .fill("3");
  const subCostGroup = row.locator(".scope-inspector-price-group").nth(0);
  for (const [basis, costLabel] of [
    ["linear ft", "Cost per linear ft"],
    ["each", "Cost per item"],
    ["hours", "Cost per hour"],
    ["days", "Cost per day"],
    ["job", "Total cost"],
    ["sq ft", "Cost per sq ft"],
  ] as const) {
    await row
      .getByLabel("Subcontractor cost basis for Tile installation")
      .selectOption(basis);
    await expect(
      subCostGroup.getByText(costLabel, { exact: true }),
    ).toBeVisible();
    await expect(
      row.getByLabel(`Subcontractor cost: ${costLabel} for Tile installation`),
    ).toBeVisible();
  }
  await row
    .getByLabel("Material cost basis for Tile installation")
    .selectOption("each");
  await row
    .getByLabel("Total items for material cost of Tile installation")
    .fill("2");
  await expect(
    row.locator(".scope-inspector-price-group").nth(0).getByText("Total sq ft"),
  ).toBeVisible();
  await expect(
    row.locator(".scope-inspector-price-group").nth(1).getByText("Total items"),
  ).toBeVisible();
  await expect(
    row
      .locator(".scope-inspector-price-group")
      .nth(1)
      .getByText("Cost per item"),
  ).toBeVisible();
  await row
    .getByLabel("Subcontractor cost basis for Tile installation")
    .selectOption("hours");
  await expect(
    row.getByLabel("Total hours for subcontractor cost of Tile installation"),
  ).toBeVisible();
  await row
    .getByLabel("Subcontractor cost basis for Tile installation")
    .selectOption("sq ft");
  await row
    .getByLabel("Material cost: Cost per item for Tile installation")
    .fill("50");
  await page.setViewportSize({ width: 1600, height: 900 });
  const subQuantity = await row
    .getByLabel("Total sq ft for subcontractor cost of Tile installation")
    .boundingBox();
  const materialQuantity = await row
    .getByLabel("Total items for material cost of Tile installation")
    .boundingBox();
  const subRate = await row
    .getByLabel("Subcontractor cost: Cost per sq ft for Tile installation")
    .boundingBox();
  const materialRate = await row
    .getByLabel("Material cost: Cost per item for Tile installation")
    .boundingBox();
  const customerQuantity = await row
    .getByLabel("Number of jobs for Tile installation")
    .boundingBox();
  const customerRate = await row
    .getByLabel("Price per job for Tile installation")
    .boundingBox();
  expect(
    subQuantity &&
      materialQuantity &&
      subRate &&
      materialRate &&
      customerQuantity &&
      customerRate,
  ).toBeTruthy();
  expect(Math.abs(subQuantity!.y - materialQuantity!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(subRate!.y - materialRate!.y)).toBeLessThanOrEqual(2);
  expect(customerQuantity!.y).toBeGreaterThan(subRate!.y);
  expect(customerRate!.y).toBeGreaterThan(customerQuantity!.y);
  await row.getByRole("button", { name: "Save Tile installation" }).click();

  const summary = page.getByRole("button", { name: "Edit Tile installation" });
  await expect(summary.getByText("Quote price", { exact: true })).toBeVisible();
  await expect(summary).toContainText("$1,000");
  await expect(summary).toContainText("$400");
  await expect(summary).toContainText("$600");
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".scope-inspector-row")).toBeVisible();
  await expect(
    page.locator(".scope-inspector-header .scope-inspector-scope"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Subcontractor cost basis for Tile installation"),
  ).toHaveValue("sq ft");
  await expect(
    page.getByLabel("Material cost basis for Tile installation"),
  ).toHaveValue("each");
  await page
    .getByLabel("Total items for material cost of Tile installation")
    .fill("3");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".scope-inspector-row")).toHaveCount(0);
  await expect(summary).toContainText("$450");
  await expect(summary).toContainText("$550");
  await page.reload();
  await expect(summary).toContainText("$450");
  await summary.click();
  await expect(
    page.getByLabel("Total items for material cost of Tile installation"),
  ).toHaveValue("3");
  await expect(
    page.getByLabel("Material cost: Cost per item for Tile installation"),
  ).toHaveValue("50");
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".scope-inspector-row")).toHaveCount(0);
});

test("quote projects can be renamed or ungrouped without losing rows", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quote name").fill("Grouped quote test");
  await dialog.getByLabel("Customer name").fill("Test Homeowner");
  await dialog.getByLabel("Email").fill("grouped@example.com");
  await dialog.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const row = page.locator(".scope-new-row");
  await row
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Demo work");
  await row.getByLabel("Price per job for Demo work").fill("250");
  await row.getByRole("button", { name: "Save Demo work" }).click();
  await expect(page.locator(".scope-section-row")).toContainText("Project #1");

  await page.getByRole("button", { name: "Rename project Project #1" }).click();
  await page.getByLabel("Project name for Project #1").fill("Kitchen phase");
  await page.getByLabel("Project name for Project #1").press("Enter");
  await expect(page.locator(".scope-section-row")).toContainText(
    "Kitchen phase",
  );
  await page.reload();
  await expect(page.locator(".scope-section-row")).toContainText(
    "Kitchen phase",
  );
  await page
    .getByRole("button", { name: "Rename project Kitchen phase" })
    .click();
  await page.getByLabel("Project name for Kitchen phase").fill("Kitchen prep");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();
  await expect(page.locator(".scope-section-row")).toContainText(
    "Kitchen prep",
  );
  await page
    .getByRole("button", { name: "Rename project Kitchen prep" })
    .click();
  await page.getByLabel("Project name for Kitchen prep").fill("Not saved");
  await page.getByLabel("Project name for Kitchen prep").press("Escape");
  await expect(page.locator(".scope-section-row")).toContainText(
    "Kitchen prep",
  );

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const secondRow = page.locator(".scope-new-row");
  await secondRow
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Finish work");
  await secondRow.getByLabel("Price per job for Finish work").fill("50");
  await secondRow.getByRole("button", { name: "Save Finish work" }).click();
  await expect(page.locator(".scope-section-row")).toHaveCount(1);
  await expect(page.locator(".scope-section-row")).toContainText("2 items");

  await page
    .getByRole("button", { name: "Remove project Kitchen prep" })
    .click();
  await expect(page.locator(".scope-section-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Demo work" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Finish work" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".scope-section-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Demo work" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Finish work" }),
  ).toBeVisible();
});
