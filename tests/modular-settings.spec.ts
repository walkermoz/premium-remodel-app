import { expect, test } from "@playwright/test";

test("Premium Remodel settings are represented as editable organization defaults", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: /Business/ })
    .click();
  await page.getByRole("button", { name: "Compliance & region" }).click();

  await expect(page.getByLabel("Legal business name")).toHaveValue(
    "Premium Living Home Improvement LLC d/b/a Premium Remodel",
  );
  await expect(page.getByLabel("SMS program name")).toHaveValue(
    "Premium Remodel",
  );
  await expect(page.getByLabel("Time zone")).toHaveValue(
    "America/New_York",
  );
  await expect(page.getByLabel("Service area")).toHaveValue(
    "Wake County, North Carolina",
  );

  await page.getByRole("button", { name: "Permissions" }).click();
  const ownerBusiness = page.getByLabel("Owner: Business settings");
  await expect(ownerBusiness).toBeChecked();
  await expect(ownerBusiness).toBeDisabled();
  await expect(page.getByLabel("Admin: Business settings")).toBeChecked();
  await expect(page.getByLabel("Office: Business settings")).not.toBeChecked();
  await expect(page.getByLabel("Admin: Automations")).toBeChecked();
  await expect(page.getByLabel("Admin: Admin API keys")).toBeChecked();
  await expect(page.getByLabel("Admin: Price book")).toBeChecked();
  await expect(page.getByLabel("Admin: Team locations")).toBeChecked();

  await page.getByRole("button", { name: "Modules" }).click();
  await expect(page.getByLabel(/Price book/)).toBeChecked();
  await expect(page.getByLabel(/Automations/)).toBeChecked();
  await expect(page.getByLabel(/Agreements/)).toBeChecked();
  await expect(page.getByLabel(/Payments/)).toBeChecked();
});
