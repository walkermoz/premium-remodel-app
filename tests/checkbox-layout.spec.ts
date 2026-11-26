import { expect, test } from "@playwright/test";
import { expectCheckboxRows } from "./checkbox-layout-assertions";

test("checkboxes keep compact inline labels across settings, themes and mobile", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: /Business/ })
    .click();
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  const boxes = page.locator('.business-module-option input[type="checkbox"]');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await expectCheckboxRows(boxes);
    }
  }
  const payments = page.getByLabel(/Payments/);
  await payments.focus();
  await expect(payments).toBeFocused();
  await payments.press("Space");
  await expect(payments).not.toBeChecked();
  await expectCheckboxRows(boxes);
  await payments.press("Space");
  await expect(payments).toBeChecked();
});
