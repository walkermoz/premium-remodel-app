import type { Page } from "@playwright/test";

export async function openSettingsSection(page: Page, label: string) {
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
