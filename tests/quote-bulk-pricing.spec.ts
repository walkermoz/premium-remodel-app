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
  await quote.getByLabel("Customer name").fill("Test Customer");
  await quote.getByLabel("Email").fill("bulk@example.com");
  await quote.getByRole("button", { name: "Create quote" }).click();

  for (const [title, subCost, materialCost] of [
    ["Tile work", "100", "50"],
    ["Fixtures", "40", "20"],
  ]) {
    await page.getByRole("button", { name: "Add Custom", exact: true }).click();
    const row = page.locator(".scope-new-row");
    await expect(row.locator(".scope-inspector-group-title")).toHaveText([
      "Sub cost",
      "Material cost",
      "Customer price",
    ]);
    await expect(
      row.getByLabel("Subcontractor cost: Total cost for new work item"),
    ).toHaveValue("");
    await expect(
      row.getByLabel("Material cost: Total cost for new work item"),
    ).toHaveValue("");
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
  await expect(page.getByText("Selected items price: $315")).toBeVisible();
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
  await expect(page.getByText("Selected items price: $255")).toBeVisible();
  await page.getByRole("button", { name: "Apply pricing" }).click();
  await expect(summaries.nth(0)).toContainText("$255");
  await expect(summaries.nth(1)).toContainText("$90");
});

test("day and hour expense rates feed cost-based quote pricing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Time-based expense example");
  await quote.getByLabel("Customer name").fill("Test Customer");
  await quote.getByLabel("Email").fill("time@example.com");
  await quote.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const row = page.locator(".scope-new-row");
  await row
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Site supervision");
  await row
    .getByLabel("Subcontractor cost basis for Site supervision")
    .selectOption("days");
  await row
    .getByLabel("Total days for subcontractor cost of Site supervision")
    .fill("2");
  await row
    .getByLabel("Subcontractor cost: Cost per day for Site supervision")
    .fill("200");
  await row
    .getByLabel("Material cost basis for Site supervision")
    .selectOption("hours");
  await row
    .getByLabel("Total hours for material cost of Site supervision")
    .fill("4");
  await row
    .getByLabel("Material cost: Cost per hour for Site supervision")
    .fill("25");
  await row
    .getByRole("button", {
      name: "Override customer price for Site supervision",
    })
    .click();
  await row.getByLabel("Unit for Site supervision").selectOption("days");
  await row.getByLabel("Total days for Site supervision").fill("2");
  await row
    .getByRole("button", {
      name: "Use automatic pricing for Site supervision",
    })
    .click();
  await expect(
    row.getByRole("button", {
      name: "Override customer price for Site supervision",
    }),
  ).toBeVisible();
  await expect(
    row.getByLabel("Price per day for Site supervision"),
  ).toHaveCount(0);
  await expect(row.locator(".scope-automatic-price")).toContainText("$790");
  await expect(row.getByText("Quote price").locator("..")).toContainText(
    "$790",
  );
  await row.getByRole("button", { name: "Save Site supervision" }).click();

  await page.getByRole("checkbox", { name: "Select Site supervision" }).check();
  await expect(page.getByText("Selected items price: $790")).toBeVisible();
  await page.getByRole("button", { name: "Apply pricing" }).click();
  await expect(page.locator(".scope-summary-row").first()).toContainText(
    "$790",
  );

  await page.reload();
  await expect(page.locator(".scope-summary-row").first()).toContainText(
    "$790",
  );
  await page.getByRole("button", { name: "Edit Site supervision" }).click();
  await expect(page.locator(".scope-automatic-price")).toContainText("$790");
  await expect(
    page.getByLabel("Price per day for Site supervision"),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Total days for subcontractor cost of Site supervision"),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Total hours for material cost of Site supervision"),
  ).toHaveValue("4");
  await page
    .getByRole("button", {
      name: "Override customer price for Site supervision",
    })
    .click();
  await expect(page.getByLabel("Total days for Site supervision")).toHaveValue(
    "2",
  );
  await expect(
    page.getByLabel("Price per day for Site supervision"),
  ).toHaveValue("395");
});

test("a customer price override stays fixed until automatic pricing is restored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Customer price override example");
  await quote.getByLabel("Customer name").fill("Test Customer");
  await quote.getByLabel("Email").fill("override@example.com");
  await quote.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  let row = page.locator(".scope-new-row");
  await row
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Override pricing");
  await row
    .getByLabel("Subcontractor cost: Total cost for Override pricing")
    .fill("100");
  await row
    .getByLabel("Material cost: Total cost for Override pricing")
    .fill("50");
  await expect(row.locator(".scope-automatic-price")).toContainText("$225");
  await expect(
    row.getByLabel("Price per job for Override pricing"),
  ).toHaveCount(0);

  await row
    .getByRole("button", {
      name: "Override customer price for Override pricing",
    })
    .click();
  await row.getByLabel("Price per job for Override pricing").fill("300");
  await row
    .getByLabel("Subcontractor cost: Total cost for Override pricing")
    .fill("200");
  await expect(row.getByText("Quote price").locator("..")).toContainText(
    "$300",
  );
  await row.getByRole("button", { name: "Save Override pricing" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Edit Override pricing" }).click();
  row = page.locator(".scope-inspector-row");
  await expect(row.locator(".scope-manual-price")).toContainText("$300");
  await expect(
    row.getByLabel("Price per job for Override pricing"),
  ).toHaveCount(0);
  await row
    .getByRole("button", {
      name: "Edit customer price override for Override pricing",
    })
    .click();
  await expect(
    row.getByLabel("Price per job for Override pricing"),
  ).toHaveValue("300");
  await row
    .getByRole("button", {
      name: "Use automatic pricing for Override pricing",
    })
    .click();
  await expect(row.locator(".scope-automatic-price")).toContainText("$395");
  await expect(row.getByText("Quote price").locator("..")).toContainText(
    "$395",
  );
  await row.getByRole("button", { name: "Save Override pricing" }).click();

  await page.reload();
  await expect(page.locator(".scope-summary-row").first()).toContainText(
    "$395",
  );
});
