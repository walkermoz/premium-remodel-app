import { test, expect, password } from "./supabase-fixture";
const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;

test("Twilio demo does not request live company credentials", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/twilio/")) requests++;
  });
  await page.goto("/demo?view=Settings");
  const section = page.getByRole("region", { name: "Twilio", exact: true });
  await expect(section).toContainText("available in your company workspace");
  await expect(section).toContainText("not enabled yet");
  expect(requests).toBe(0);
});

cloudTest(
  "Twilio settings are private, administrator-only, responsive, and recover after an error",
  async ({ company, page, request }) => {
    expect((await request.get("/api/twilio/config")).status()).toBe(401);
    expect(
      (
        await request.post("/api/twilio/install-link", {
          headers: { Origin: "http://localhost:3100" },
          data: { phone: "(919) 555-0123" },
        })
      ).status(),
    ).toBe(401);
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: { Origin: "http://localhost:3100" },
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const config = await api.get("/api/twilio/config");
    expect(config.status()).toBe(200);
    expect(config.headers()["cache-control"]).toContain("no-store");
    expect(await config.json()).toEqual({
      configured: false,
      account: null,
      numbers: [],
      hasMoreNumbers: false,
      tollFreeVerification: null,
      checkedAt: null,
    });
    const unavailableMessage = await api.post("/api/twilio/install-link", {
      headers: { Origin: "http://localhost:3100" },
      data: { phone: "(919) 555-0123" },
    });
    expect(unavailableMessage.status()).toBe(503);
    expect(await unavailableMessage.json()).toEqual({
      error: "Twilio messaging is not configured.",
    });
    await page.goto("/?view=Settings");
    const section = page.getByRole("region", { name: "Twilio", exact: true });
    await expect(section).toContainText("Twilio is not connected.");
    const sid = `AC${"a".repeat(32)}`;
    let fail = false;
    await page.route("**/api/twilio/config", (route) =>
      route.fulfill({
        status: fail ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          fail
            ? { error: "Twilio could not be reached. Please check again." }
            : {
                configured: true,
                account: {
                  sid,
                  name: "My first Twilio account",
                  status: "active",
                  type: "Full",
                },
                numbers: [
                  {
                    sid: `PN${"c".repeat(32)}`,
                    number: "+19195550123",
                    name: "Office",
                    voice: true,
                    sms: true,
                    mms: true,
                  },
                ],
                hasMoreNumbers: false,
                tollFreeVerification: null,
                checkedAt: new Date().toISOString(),
              },
        ),
      }),
    );
    await section.getByRole("button", { name: "Check connection" }).click();
    await expect(section).toContainText("Connected · Active account");
    await expect(section).toContainText("Saved securely on server");
    await expect(section).toContainText("Voice · SMS · MMS");
    await expect(section).toContainText(sid);
    await expect(section.locator('input[type="password"]')).toHaveCount(0);
    await section.screenshot({ path: "artifacts/twilio-settings-light.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Color theme").selectOption("dark");
    await page.reload();
    await expect(section).toContainText("Connected · Active account");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await section.screenshot({
      path: "artifacts/twilio-settings-mobile-dark.png",
    });
    await page.screenshot({
      path: "artifacts/twilio-settings-mobile-page.png",
    });
    fail = true;
    await section.getByRole("button", { name: "Check connection" }).click();
    await expect(section.getByRole("alert")).toContainText(
      "could not be reached",
    );
    await expect(section).not.toContainText("Connected · Active account");
    fail = false;
    await section.getByRole("button", { name: "Check connection" }).click();
    await expect(section).toContainText("Connected · Active account");
    await page.unroute("**/api/twilio/config");
    const changed = await company.admin
      .from("profiles")
      .update({ role: "crew" })
      .eq("organization_id", company.organizationId)
      .eq("email", company.email);
    expect(changed.error).toBeNull();
    expect((await api.get("/api/twilio/config")).status()).toBe(403);
    expect(
      (
        await api.post("/api/twilio/install-link", {
          headers: { Origin: "http://localhost:3100" },
          data: { phone: "(919) 555-0123" },
        })
      ).status(),
    ).toBe(403);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: false }),
    ).toBeVisible();
    await expect(section).toHaveCount(0);
  },
);
