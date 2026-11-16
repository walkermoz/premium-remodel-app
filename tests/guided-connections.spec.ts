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

  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: /Get started/ })
    .click();
  await page.getByRole("button", { name: "Connect phone" }).click();
  await expect(
    page.getByRole("region", { name: "Phone & texting" }),
  ).toContainText("Find your Twilio credentials");
});
