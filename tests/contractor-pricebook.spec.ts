import { expect, test } from "@playwright/test";

test("price-book categories can be selected or added while editing an item", async ({
  page,
}) => {
  await page.goto("/demo?view=Price+book");
  await page.getByRole("button", { name: "New item" }).click();
  const editor = page.getByRole("dialog", { name: "New price-book item" });
  const category = editor.getByRole("combobox", { name: "Category" });
  await expect(category).toHaveValue("General");
  await expect(category.locator("option")).toHaveText([
    "General",
    "Tile",
    "Add new category…",
  ]);
  await category.selectOption("__add_new__");
  await editor.getByLabel("New category").fill("Painting");
  await editor.getByLabel("Work item").fill("Cabinet painting");
  await editor.getByRole("button", { name: "Create item" }).click();
  await expect(editor).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Painting", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit item" }).click();
  const edit = page.getByRole("dialog", { name: "Edit price-book item" });
  await expect(edit.getByRole("combobox", { name: "Category" })).toHaveValue(
    "Painting",
  );
  await edit.getByRole("combobox", { name: "Category" }).selectOption("Tile");
  await expect(edit.getByLabel("New category")).toHaveCount(0);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Cabinet painting/ }).click();
  await page.getByRole("button", { name: "Edit item" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Edit price-book item" })
      .getByRole("combobox", { name: "Category" }),
  ).toHaveValue("Tile");
});

test("contractor rates can be maintained on a price-book item", async ({
  page,
}) => {
  await page.goto("/demo?view=Price+book");
  await page.getByRole("button", { name: "Edit item" }).click();
  const editor = page.getByRole("dialog", { name: "Edit price-book item" });
  const noahRate = editor.locator(".pricebook-contractor-rate-row").nth(1);
  await expect(noahRate).toContainText("Noah Patel");
  await noahRate.getByRole("spinbutton").fill("21");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByLabel("Selected price-book item")).toContainText(
    "$21.00 per sq ft",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("premium-remodel-demo-pricebook-v1") || "[]",
    ),
  );
  expect(saved[0].contractorRates[1]).toMatchObject({
    contractorId: "c6",
    rateCents: 2100,
  });
});

test("tile price book asks which contractor and snapshots the selected rate on a quote", async ({
  page,
}) => {
  await page.goto("/demo?view=Price+book");
  await expect(
    page.getByRole("heading", { name: "Price book." }),
  ).toBeVisible();
  const inspector = page.getByLabel("Selected price-book item");
  await expect(inspector).toContainText("Tile installation");
  await expect(inspector).toContainText("Luis Martinez");
  await expect(inspector).toContainText("$18.00 per sq ft");
  await expect(inspector).toContainText("Noah Patel");
  await expect(inspector).toContainText("$20.00 per sq ft");

  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Tile contractor comparison");
  await quote.getByLabel("Customer name").fill("Sample Customer");
  await quote.getByLabel("Email").fill("sample@example.com");
  await quote.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Item" }).click();
  const picker = page.getByRole("dialog", { name: "Add from price book" });
  await picker.getByLabel("Total sq ft").fill("250");
  await expect(picker).toContainText("Choose a contractor");
  await picker
    .getByLabel("Which contractor will do this work?")
    .selectOption("c5");
  await expect(picker.locator(".pricebook-picker-pricing")).toContainText(
    "$4,500.00",
  );
  await expect(picker.locator(".pricebook-picker-pricing")).toContainText(
    "$2,000.00",
  );
  await picker.getByRole("button", { name: "Add to quote" }).click();
  await expect(picker).toBeHidden();

  await page.getByRole("button", { name: "Add Item" }).click();
  const second = page.getByRole("dialog", { name: "Add from price book" });
  await second.getByLabel("Total sq ft").fill("250");
  await second
    .getByLabel("Which contractor will do this work?")
    .selectOption("c6");
  await expect(second.locator(".pricebook-picker-pricing")).toContainText(
    "$5,000.00",
  );
  await expect(second.locator(".pricebook-picker-pricing")).toContainText(
    "$1,500.00",
  );
  await second.getByRole("button", { name: "Add to quote" }).click();

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
  );
  const created = stored.quotes.find(
    (entry: { name: string }) => entry.name === "Tile contractor comparison",
  );
  const lines = stored.scope.filter(
    (entry: { projectId: string }) => entry.projectId === created.id,
  );
  expect(lines).toHaveLength(2);
  expect(
    lines.find(
      (entry: { contractorId: string }) => entry.contractorId === "c5",
    ),
  ).toMatchObject({ estimate: 7000, subCost: 4500, materialCost: 500 });
  expect(
    lines.find(
      (entry: { contractorId: string }) => entry.contractorId === "c6",
    ),
  ).toMatchObject({ estimate: 7000, subCost: 5000, materialCost: 500 });
});
