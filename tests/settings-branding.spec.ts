import { expect, test } from "@playwright/test";

test("business branding is organized and keeps edits while browsing settings", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await expect(
    page.getByRole("heading", { name: "Brand assets" }),
  ).toBeVisible();
  await expect(page.getByText("Primary logo", { exact: true })).toBeVisible();
  await expect(
    page.getByText("White / reversed logo", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Square mark", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Client portal banner", { exact: true }),
  ).toBeVisible();

  const url = page.getByLabel("Primary logo URL");
  await url.fill("https://example.com/updated-logo.png");
  await page.getByRole("button", { name: "Business details" }).click();
  await expect(page.getByLabel("Company name")).toBeVisible();
  await page.getByRole("button", { name: "Brand", exact: true }).click();
  await expect(url).toHaveValue("https://example.com/updated-logo.png");

  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: /Connections/ })
    .click();
  await expect(
    page.getByText("Google Calendar", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Settings categories" })
    .getByRole("button", { name: /Business/ })
    .click();
  await expect(url).toHaveValue("https://example.com/updated-logo.png");
});

test("private brand assets require workspace access", async ({ request }) => {
  const response = await request.get("/api/business-branding/banner");
  expect(response.status()).toBe(401);
  const portal = await request.get("/api/client-quote/invalid/banner");
  expect(portal.status()).toBe(404);
});
