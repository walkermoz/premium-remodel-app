import { expect, test } from "@playwright/test";

test("quote work item stays open while building and only retracts on its toggle", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quote = page.getByRole("dialog", { name: "New quote" });
  await quote.getByLabel("Quote name").fill("Scope row persistence");
  await quote.getByLabel("Client name").fill("Test Customer");
  await quote.getByRole("button", { name: "Create quote" }).click();

  await page.getByRole("button", { name: "Add row", exact: true }).click();
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
