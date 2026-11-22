import { expect, type Page } from "@playwright/test";

export async function openSettingsSection(page: Page, label: string) {
  await expect(
    page.locator(
      '#settings-section:visible, nav[aria-label="Settings categories"]:visible',
    ),
  ).toHaveCount(1);
  const picker = page.getByLabel("Settings section", { exact: true });
  if (await picker.isVisible()) {
    await picker.selectOption({ label });
  } else {
    await page
      .getByRole("navigation", { name: "Settings categories" })
      .getByRole("button", { name: label, exact: true })
      .click();
  }
}
