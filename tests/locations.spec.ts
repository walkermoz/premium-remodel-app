import { test, expect } from "@playwright/test";
import {
  appInstallMessage,
  appInstallUrl,
  normalizeSmsRecipient,
} from "../lib/install-link";
import { locationAge } from "../lib/location";

test("location age distinguishes recent, stale and expired positions", () => {
  const now = Date.now(),
    location = {
      latitude: 35.7,
      longitude: -78.6,
      accuracy: 25,
      capturedAt: new Date(now).toISOString(),
    };
  expect(locationAge(location, now)).toMatchObject({
    stale: false,
    expired: false,
  });
  expect(locationAge(location, now + 120000)).toMatchObject({
    stale: true,
    expired: false,
    label: "Updated 2 min ago",
  });
  expect(locationAge(location, now + 3600000).expired).toBe(true);
});

test("phone app text stays in one SMS segment and normalizes US numbers", () => {
  expect(appInstallMessage).toContain(appInstallUrl);
  expect(appInstallMessage.length).toBeLessThanOrEqual(160);
  expect(normalizeSmsRecipient("(919) 555-0123")).toBe("+19195550123");
  expect(normalizeSmsRecipient("+44 20 7946 0958")).toBe("+442079460958");
  expect(normalizeSmsRecipient("555")).toBeNull();
});

test("team page sends the phone app link through Twilio", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/twilio/install-link")) requests++;
  });
  await page.goto("/demo?view=Team");
  await page.getByRole("button", { name: "Send app link" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Text the Premium Remodel app link",
  });
  await dialog.getByLabel("Teammate phone number").fill("(919) 555-0123");
  await dialog.getByRole("button", { name: "Send link" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Sample mode does not contact Twilio",
  );
  expect(requests).toBe(0);
  await page.screenshot({
    path: "artifacts/team-app-link-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/team-app-link-mobile.png",
    fullPage: true,
  });
});

test("sample map supports selection, persistent sharing controls, stop and mobile layouts", async ({
  page,
}) => {
  await page.goto("/demo?view=Team+map");
  await expect(page.getByRole("heading", { name: "Team map." })).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Casey Wilson/ }),
  ).toContainText("Last known");
  await page.getByRole("button", { name: /Jordan Lee/ }).click();
  await expect(page.locator(".leaflet-popup")).toContainText("Jordan Lee");
  await page
    .getByRole("button", { name: "Share my location", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your location sharing is on" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Location sharing is on. Open sharing controls",
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Stop sharing", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Share my location", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /Alex Morgan \(you\)/ }),
  ).toContainText("No shared location");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Use on your phone", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Install Premium Remodel" }),
  ).toContainText("Add to Home Screen");
});

test("phone manifest, icons and offline fallback do not cache company data", async ({
  page,
  context,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    name: "Premium Remodel",
    start_url: "/",
    display: "standalone",
  });
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).status()).toBe(200);
  const response = await page.goto("/demo");
  expect(response!.headers()["permissions-policy"]).toContain(
    "geolocation=(self)",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("premium-remodel-offline-v1");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached).toEqual(["/offline.html"]);
  await context.setOffline(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "You’re offline" }),
  ).toBeVisible();
  await context.setOffline(false);
});
