import { openSettingsSection } from "./settings-helpers";
import { expect, test } from "@playwright/test";

test("setup checklist opens the matching connection guidance", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await expect(
    page.getByRole("heading", { name: "Setup checklist" }),
  ).toBeVisible();

  await page.getByText(/^Optional tools \(/).click();
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
    .getByRole("button", { name: "Payment settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Quotes & payments",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
});
