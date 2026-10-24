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
  ).toHaveText("Flat price");
  await table
    .getByRole("button", { name: "Edit Flooring", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Pricing basis")).toHaveValue("job");
  await expect(dialog.getByLabel("Quantity", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Pricing basis").selectOption("sq ft");
  await expect(dialog.getByLabel("Quantity", { exact: true })).toBeVisible();
  await dialog.getByLabel("Pricing basis").selectOption("job");
  await expect(dialog.getByLabel("Quantity", { exact: true })).toHaveCount(0);
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
    '"Project section","Work item","Scope details","Quantity","Unit","Price","Subcontractor cost","Material cost","Difference"',
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

test("quotes carry their contact, scope and files into a planning project", async ({
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
  await dialog.getByLabel("Client name").fill("Jason");
  await dialog.getByLabel("Client email").fill("jason@example.com");
  await dialog.getByLabel("Client phone").fill("9195550100");
  await dialog.getByRole("button", { name: "Create quote" }).click();
  await expect(
    page.getByRole("heading", { name: "Jason’s garage quote", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", /\/api\/quotes\/[0-9a-f-]+\/pdf$/);
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const newRow = page.locator(".scope-new-row");
  await newRow
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Garage framing");
  await newRow
    .getByLabel("Price for Garage framing", { exact: true })
    .fill("5000.15");
  await newRow
    .getByLabel("Subcontractor cost for Garage framing", { exact: true })
    .fill("2000");
  await newRow
    .getByLabel("Material cost for Garage framing", { exact: true })
    .fill("750.15");
  await newRow.getByRole("button", { name: "Save Garage framing" }).click();
  await expect(newRow).toHaveCount(0);
  const savedRow = page.locator(".scope-table tbody tr").filter({
    has: page.locator('input[value="Garage framing"]'),
  });
  await savedRow.getByLabel("Price for Garage framing").fill("5100.15");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();
  await expect(page.locator(".scope-table tfoot")).toContainText("$5,100.15");
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
  await page.getByRole("button", { name: "Accept quote", exact: true }).click();
  await expect(page.getByLabel("Project status")).toHaveValue("Planning");
  expect(new URL(page.url()).searchParams.get("project")).toBe(quoteId);
  await expect(page.locator(".scope-metrics")).toContainText("$5,100.15");
  await expect(page.locator(".scope-price-warning")).toHaveCount(0);
  await expect(page.locator(".scope-table")).toContainText("Garage framing");
  await expect(page.locator(".scope-table tfoot")).toContainText("$750.15");
  await expect(page.locator(".scope-table tfoot")).toContainText("$2,350");
  await page.getByRole("tab", { name: /Photos & files/ }).click();
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.reload();
  await expect(page.locator(".files-panel")).toContainText("quote.txt");
  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await expect(page.locator(".quote-row")).toHaveCount(0);
});

test("per-unit quote rates calculate and persist the line total", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quote name").fill("Hourly labor test");
  await dialog.getByLabel("Client name").fill("Test Homeowner");
  await dialog.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const row = page.locator(".scope-new-row");
  await row
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Labor");
  await row.getByLabel("Unit for Labor").selectOption("hours");
  await row.getByLabel("Quantity for Labor").fill("2.5");
  await row.getByLabel("Rate per hour for Labor").fill("80");
  await expect(row.locator(".scope-line-total")).toHaveText("Total $200");
  await row.getByRole("button", { name: "Save Labor" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator(".scope-table tfoot")).toContainText("$200");
  await page.reload();
  await expect(page.getByLabel("Rate per hour for Labor")).toHaveValue("80");
  await expect(page.locator(".scope-table tfoot")).toContainText("$200");
});

test("bathroom questionnaire turns detailed selections into editable quote rows", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Quote name").fill("Bathroom template quote");
  await createDialog.getByLabel("Client name").fill("Taylor Homeowner");
  await createDialog.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add project" }).click();
  const templateDialog = page.getByRole("dialog", {
    name: "Bathroom questionnaire",
  });
  await expect(templateDialog.getByLabel("Customer name")).toHaveValue(
    "Taylor Homeowner",
  );
  await templateDialog.getByLabel("Project name").fill("Primary Bathroom");
  await templateDialog.getByLabel("Room length").fill("10 ft");
  await templateDialog.getByLabel("Room width").fill("8 ft");
  await templateDialog.getByLabel("Ceiling height").fill("9 ft");
  await templateDialog
    .getByRole("group", { name: "Vanity", exact: true })
    .getByLabel("Replace")
    .check();
  await templateDialog
    .getByRole("group", { name: "Toilet", exact: true })
    .getByLabel("Keep")
    .check();
  await templateDialog
    .getByRole("group", { name: "Bathroom floor tile", exact: true })
    .getByLabel("Replace")
    .check();
  await templateDialog.getByRole("button", { name: "Continue" }).click();

  await templateDialog.getByLabel("Shower base").selectOption("Curbless");
  await templateDialog
    .getByLabel("Tile supply / allowance")
    .selectOption("Include allowance");
  await templateDialog
    .getByLabel("Tile style, color, and size")
    .fill("Large warm-white porcelain");
  await templateDialog.getByLabel("Recessed niche").check();
  await templateDialog
    .getByLabel("Shower valve, trim, and shower head")
    .selectOption("Replace");
  await templateDialog
    .getByLabel("Preferred fixture finish / brand")
    .fill("Brushed nickel");
  await templateDialog.getByRole("button", { name: "Continue" }).click();

  await templateDialog
    .getByLabel("Glass preference", { exact: true })
    .selectOption("Frameless clear glass");
  await templateDialog.getByLabel("Hardware finish").fill("Brushed nickel");
  await templateDialog.getByLabel("Replace mirror / light").check();
  await templateDialog
    .getByLabel("Priorities, inspiration, products, and notes")
    .fill("Prioritize an easy-to-clean shower and accessible storage.");
  await templateDialog.getByRole("button", { name: "Continue" }).click();

  await expect(templateDialog.getByText(/quote rows ready/)).toBeVisible();
  await expect(templateDialog).toContainText("Shower base & waterproofing");
  await page.evaluate(() => {
    const tableBody = document.querySelector(".scope-table-editable tbody");
    if (!tableBody) throw new Error("Scope table body was not found.");
    const state = {
      counts: [] as number[],
      observer: null as MutationObserver | null,
    };
    state.observer = new MutationObserver(() => {
      const count = tableBody.querySelectorAll(
        ":scope > tr:not(.scope-add-row)",
      ).length;
      if (state.counts.at(-1) !== count) state.counts.push(count);
    });
    state.observer.observe(tableBody, { childList: true });
    (
      window as typeof window & {
        __scopeBatchTest?: typeof state;
      }
    ).__scopeBatchTest = state;
  });
  await templateDialog
    .getByRole("button", { name: /Add \d+ quote rows/ })
    .click();
  await expect(templateDialog).not.toBeVisible();

  const table = page.locator(".scope-table");
  await expect(
    table.getByLabel("Work item Demolition & site protection"),
  ).toBeVisible();
  await expect(table.locator(".scope-section-row")).toContainText(
    "Primary Bathroom",
  );
  const batchRender = await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __scopeBatchTest?: {
          counts: number[];
          observer: MutationObserver | null;
        };
      }
    ).__scopeBatchTest;
    state?.observer?.disconnect();
    return state?.counts || [];
  });
  expect(batchRender).toHaveLength(1);
  await expect(
    table.getByLabel("Work item Shower wall tile installation"),
  ).toBeVisible();
  await expect(
    table.getByLabel("Quantity for Shower base & waterproofing"),
  ).toHaveCount(0);
  await expect(
    table.getByLabel("Unit for Shower base & waterproofing"),
  ).toHaveValue("job");
  await expect(
    table.getByLabel("Quantity for Shower wall tile installation"),
  ).toBeVisible();
  await expect(
    table.getByLabel("Unit for Shower wall tile installation"),
  ).toHaveValue("sq ft");
  await expect(
    table.getByLabel("Details for Shower base & waterproofing"),
  ).toHaveValue(/Base: Curbless/);
  await expect
    .poll(() =>
      table
        .getByLabel("Details for Shower base & waterproofing")
        .evaluate(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
    )
    .toBe(true);
  await expect(
    table.getByLabel("Details for Shower wall tile installation"),
  ).toHaveValue(/Large warm-white porcelain/);
  await expect(table.getByLabel("Work item Toilet installation")).toHaveCount(
    0,
  );
  await expect(
    table.getByLabel("Details for Demolition & site protection"),
  ).toHaveValue(/Room: 10 ft x 8 ft/);
  await expect(
    table.getByLabel("Details for Paint, finish carpentry & final cleanup"),
  ).toHaveValue(/Prioritize an easy-to-clean shower and accessible storage/);
  await table
    .getByRole("button", { name: "Delete Demolition & site protection" })
    .click();
  await expect(page.getByRole("dialog", { name: /Delete this/ })).toHaveCount(
    0,
  );
  await expect(
    table.getByLabel("Work item Demolition & site protection"),
  ).toHaveCount(0);

  await table.getByLabel("Price for Shower base & waterproofing").fill("4250");
  await table
    .getByRole("button", { name: "Save Shower base & waterproofing" })
    .click();
  await expect(table.locator("tfoot")).toContainText("$4,250");

  await page.getByRole("button", { name: "Add project" }).click();
  const secondProject = page.getByRole("dialog", {
    name: "Bathroom questionnaire",
  });
  await secondProject.getByLabel("Project name").fill("Guest Bathroom");
  await secondProject.getByRole("button", { name: "Continue" }).click();
  await secondProject.getByRole("button", { name: "Continue" }).click();
  await secondProject.getByRole("button", { name: "Continue" }).click();
  await secondProject
    .getByRole("button", { name: /Add \d+ quote rows/ })
    .click();
  await expect(table.locator(".scope-section-row")).toHaveCount(2);
  await expect(table.locator(".scope-section-row").nth(0)).toContainText(
    "Primary Bathroom",
  );
  await expect(table.locator(".scope-section-row").nth(1)).toContainText(
    "Guest Bathroom",
  );
});
