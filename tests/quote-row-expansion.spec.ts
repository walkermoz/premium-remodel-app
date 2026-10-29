import { expect, test } from "@playwright/test";

test("quote actions offer a price-book item or a custom row", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Quote action options");
  await quote.getByLabel("Customer name").fill("Test Customer");
  await quote.getByLabel("Email").fill("rows@example.com");
  await quote.getByRole("button", { name: "Create quote" }).click();

  const actions = page.locator(".scope-add-actions").getByRole("button");
  await expect(actions).toHaveText(["Add Item", "Add Custom"]);
  await actions.first().click();
  await expect(
    page.getByRole("dialog", { name: "Add from price book" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Add from price book" })
    .getByRole("button", { name: "Close dialog" })
    .click();
  await page.getByRole("button", { name: "Add Custom" }).click();
  await expect(page.locator(".scope-new-row")).toBeVisible();
});

test("quote work item stays open while building and only retracts on its toggle", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Scope row persistence");
  await quote.getByLabel("Customer name").fill("Test Customer");
  await quote.getByLabel("Email").fill("rows-closed@example.com");
  await quote.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add Custom", exact: true }).click();
  const newRow = page.locator(".scope-new-row");
  await newRow
    .getByRole("textbox", { name: "New work item", exact: true })
    .fill("Kitchen cabinets");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();
  await expect(newRow).toBeVisible();
  await expect(
    newRow.getByRole("textbox", { name: "New work item", exact: true }),
  ).toHaveValue("Kitchen cabinets");
  await newRow.getByLabel("Price per job for Kitchen cabinets").fill("1200");
  await newRow.getByRole("button", { name: "Save Kitchen cabinets" }).click();
  await expect(newRow).toHaveCount(0);

  const toggle = page.getByRole("button", { name: "Edit Kitchen cabinets" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const editor = page.locator(".scope-inspector-row:not(.scope-new-row)");
  await editor.getByLabel("Price per job for Kitchen cabinets").fill("1300");
  await page.getByRole("heading", { name: "Scope & pricing" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(editor).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
