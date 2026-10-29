import { expect, test } from "@playwright/test";

test("Premium Remodel defaults customer quotes to scope and total only", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await page.getByRole("button", { name: "Quotes & payments" }).click();
  const detail = page.getByLabel("Customer quote price detail");
  await expect(detail).toHaveValue("total");
  await detail.selectOption("itemized");
  await expect(detail).toHaveValue("itemized");
  await expect(
    page.getByText("Controls the client portal and quote PDF"),
  ).toBeVisible();
});
