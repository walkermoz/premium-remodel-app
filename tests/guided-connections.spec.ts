import { openSettingsSection } from "./settings-helpers";
import { expect, test } from "@playwright/test";

test("setup checklist opens the matching connection guidance", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await expect(
    page.getByRole("heading", { name: "Get your business ready" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Connect reviews" }).click();
  const reviews = page.getByRole("region", { name: "Google reviews" });
  await expect(reviews).toBeVisible();
  await expect(reviews).toContainText("Connect in three steps");

  await openSettingsSection(page, "Setup checklist");
  await page.getByRole("button", { name: "Connect phone" }).click();
  await expect(
    page.getByRole("region", { name: "Phone & texting" }),
  ).toContainText("Find your Twilio credentials");
  await openSettingsSection(page, "Setup checklist");
  await page
    .getByRole("button", { name: "Manage modules", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Business modules", exact: true }),
  ).toBeVisible();
});
