import { expect, test } from "@playwright/test";
test("business creation is available in workspace setup", async ({ page }) => {
  await page.goto("/demo?view=Settings");
  await expect(
    page.getByRole("heading", { name: "Setup checklist" }),
  ).toBeVisible();
});

test("non-administrators only see permitted settings", async ({ page }) => {
  await page.goto("/demo?as=doorknocker&view=Settings#permissions");
  const categories = page.getByRole("navigation", {
    name: "Settings categories",
  });
  for (const name of [
    "Setup checklist",
    "Company",
    "Connected accounts",
    "Roles & access",
    "Company alerts",
    "Developer API access",
  ]) {
    await expect(
      categories.getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("heading", { name: "Setup checklist" }),
  ).toHaveCount(0);
  await categories
    .getByRole("button", { name: "Account security", exact: true })
    .click();
  await expect(page.getByLabel("Current password")).toBeVisible();
  await categories
    .getByRole("button", { name: "My Google Calendar", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Google Calendar", exact: true }),
  ).toBeVisible();
});
