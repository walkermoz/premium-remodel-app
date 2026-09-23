import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

test("Google Calendar sample settings do not contact a live account", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/google-calendar")) requests++;
  });
  await page.goto("/demo?view=Settings");
  const section = page.getByRole("region", {
    name: "Google Calendar",
    exact: true,
  });
  await expect(section).toContainText(
    "available in your signed-in company workspace",
  );
  await expect(section).toContainText("Premium Remodel");
  expect(requests).toBe(0);
});

cloudTest(
  "Google Calendar connections are private, optional, and server configured",
  async ({ company, page, request }) => {
    expect((await request.get("/api/google-calendar")).status()).toBe(401);
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const status = await api.get("/api/google-calendar");
    expect(status.status()).toBe(200);
    expect(status.headers()["cache-control"]).toContain("no-store");
    expect(await status.json()).toEqual({
      configured: false,
      connected: false,
      email: null,
      calendarName: null,
      lastSyncedAt: null,
      lastError: null,
    });
    const sync = await api.post("/api/google-calendar", {
      headers: origin,
    });
    expect(sync.status()).toBe(503);
    expect(await sync.json()).toEqual({
      error: "Google Calendar is not configured for this workspace yet.",
    });

    await page.goto("/?view=Settings");
    const section = page.getByRole("region", {
      name: "Google Calendar",
      exact: true,
    });
    await expect(section).toContainText("setup is not configured yet");
    await expect(section.locator('input[type="password"]')).toHaveCount(0);

    await page.route("**/api/google-calendar", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          connected: false,
          email: null,
          calendarName: null,
          lastSyncedAt: null,
          lastError: null,
        }),
      });
    });
    await page.reload();
    await expect(section).toContainText("Connect your Google account");
    await expect(
      section.getByRole("link", { name: "Connect Google Calendar" }),
    ).toHaveAttribute("href", "/api/google-calendar/connect");
    await expect(section).toContainText(
      "cannot read or change your other calendars",
    );
  },
);
