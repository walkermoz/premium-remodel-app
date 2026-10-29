import { expect, test } from "@playwright/test";
import { calculatedQuotePrice } from "../lib/quote-bulk-pricing";

test("cost multipliers calculate each row price independently", () => {
  expect(
    calculatedQuotePrice({ subCost: 100, materialCost: 50 }, 1.7, 1.1),
  ).toBe(225);
  expect(calculatedQuotePrice({ subCost: 18, materialCost: 0 }, 1.7, 1.1)).toBe(
    30.6,
  );
});

test("quote pricing requires an authenticated workspace", async ({
  request,
}) => {
  const response = await request.post("/api/workspace/scope-pricing", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      quoteId: "d711fa59-493c-47d5-806d-18362f32fe61",
      items: [
        {
          id: "ec02922a-89a0-40e3-97ad-1fd8e784ce6f",
          updatedAt: "2026-10-28T00:00:00.000Z",
        },
      ],
      subMultiplier: 1.7,
      materialMultiplier: 1.1,
    },
  });
  expect(response.status()).toBe(401);
});

test("select all applies cost-based pricing and saves quote prices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Bulk pricing example");
  await quote.getByLabel("Client name").fill("Test Customer");
  await quote.getByRole("button", { name: "Create quote" }).click();

  for (const [title, subCost, materialCost] of [
    ["Tile work", "100", "50"],
    ["Fixtures", "40", "20"],
  ]) {
    await page.getByRole("button", { name: "Add row", exact: true }).click();
    const row = page.locator(".scope-new-row");
    await expect(row.locator(".scope-inspector-group-title")).toHaveText([
      "Sub cost",
      "Material cost",
      "Customer price",
    ]);
    await row
      .getByRole("textbox", { name: "New work item", exact: true })
      .fill(title);
    await row
      .getByRole("spinbutton", {
        name: new RegExp(`Subcontractor cost:.*for ${title}`),
      })
      .fill(subCost);
    await row
      .getByRole("spinbutton", {
        name: new RegExp(`Material cost:.*for ${title}`),
      })
      .fill(materialCost);
    await row.getByRole("button", { name: `Save ${title}` }).click();
    await expect(row).toHaveCount(0);
  }

  const selectAll = page.getByRole("checkbox", {
    name: "Select all quote items",
  });
  await selectAll.check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await expect(page.getByText("New quote total: $315")).toBeVisible();
  await page.getByRole("button", { name: "Apply pricing" }).click();
  await expect(selectAll).not.toBeChecked();
  const summaries = page.locator(".scope-summary-row");
  await expect(summaries.nth(0)).toContainText("$225");
  await expect(summaries.nth(1)).toContainText("$90");

  await page.reload();
  await expect(summaries.nth(0)).toContainText("$225");
  await expect(summaries.nth(1)).toContainText("$90");
  await page.getByRole("checkbox", { name: "Select Tile work" }).check();
  await page
    .getByRole("spinbutton", { name: "Subcontractor cost multiplier" })
    .fill("2");
  await page.getByRole("button", { name: "Apply pricing" }).click();
  await expect(summaries.nth(0)).toContainText("$255");
  await expect(summaries.nth(1)).toContainText("$90");
});
