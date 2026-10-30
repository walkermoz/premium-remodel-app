import { expect, test } from "@playwright/test";

const token = "browserroomscantesttoken_1234567890_ABCDEFGHIJKL";

test("room scan link requires the LiDAR field app", async ({ page }) => {
  await page.route(`**/api/room-scans/capture/${token}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        completed: false,
        expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        quote: {
          name: "Primary bathroom remodel",
          address: "1214 Willowbrook Drive, Cary, NC",
          customer: "Jordan Lee",
        },
      }),
    });
  });

  await page.goto(`/room-scan/${token}`);

  await expect(
    page.getByRole("heading", {
      name: "Open the Premium Remodel field app",
    }),
  ).toBeVisible();
  await expect(page.getByText("Primary bathroom remodel")).toBeVisible();
  await expect(page.getByText(/Continue in browser/)).toHaveCount(0);
  await expect(page.getByText(/Enter room measurements/)).toHaveCount(0);

  const appLink = page.getByRole("link", { name: /Open scanner app/ });
  await expect(appLink).toHaveAttribute(
    "href",
    new RegExp(`^premiumremodelfield://room-scan\\?.*token=${token}`),
  );
  await expect(appLink).toHaveAttribute(
    "href",
    /server=http%3A%2F%2Flocalhost%3A3100/,
  );
  await expect(
    page.getByRole("link", { name: "Install or update it" }),
  ).toHaveAttribute("href", "/mobile");
});
