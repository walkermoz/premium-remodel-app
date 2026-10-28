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
    page.getByRole("heading", { name: "Google Calendar", exact: true }),
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

test("brand previews show asset placement without leaving settings", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");

  await page.getByRole("button", { name: "See in context" }).first().click();
  const preview = page.getByRole("dialog", { name: "Primary logo" });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Quote email" }),
  ).toBeVisible();
  await expect(
    preview.getByRole("heading", {
      name: "Workspace navigation · light theme",
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).not.toBeVisible();

  await page.getByRole("button", { name: "See in context" }).nth(1).click();
  await expect(
    page.getByRole("dialog", { name: "White / reversed logo" }),
  ).toContainText("Workspace navigation · dark theme");
  await page.getByRole("button", { name: "Close preview" }).click();

  await page.getByRole("button", { name: "See in context" }).nth(2).click();
  await expect(page.getByRole("dialog", { name: "Square mark" })).toContainText(
    "Workspace switcher",
  );
  await page.getByRole("button", { name: "Close preview" }).click();

  await page.getByRole("button", { name: "See in context" }).nth(3).click();
  await expect(
    page.getByRole("dialog", { name: "Client portal banner" }),
  ).toContainText("Client portal · quote page");
});
