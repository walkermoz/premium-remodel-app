import { expect, test } from "@playwright/test";

const token = "browserroomscantesttoken_1234567890_ABCDEFGHIJKL";

test("room scan link offers the app and completes browser measurements", async ({
  page,
}) => {
  const uploads: string[] = [];
  let savedCapture: Record<string, unknown> | null = null;

  await page.route(`**/api/room-scans/capture/${token}`, async (route) => {
    if (route.request().method() === "POST") {
      savedCapture = route.request().postDataJSON() as Record<string, unknown>;
      const capture = savedCapture as {
        roomName: string;
        capturedAt: string;
        device: Record<string, string>;
        measurements: Record<string, number>;
        surfaces: unknown[];
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "d639610b-0a23-42ad-aee1-c61a124d0047",
          quoteId: "dbd76f8f-956f-4ef5-b3a6-15436fa31db4",
          roomName: capture.roomName,
          capturedAt: capture.capturedAt,
          createdAt: capture.capturedAt,
          createdByName: "Test User",
          device: capture.device,
          measurements: capture.measurements,
          surfaceCount: capture.surfaces.length,
        }),
      });
      return;
    }
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
        uploads: {
          model: {
            url: "http://localhost:3100/test-upload/room.usdz",
            contentType: "model/vnd.usdz+zip",
          },
          preview: {
            url: "http://localhost:3100/test-upload/floor-plan.png",
            contentType: "image/png",
          },
          headers: { "x-test-upload": "true" },
        },
      }),
    });
  });
  await page.route("**/test-upload/**", async (route) => {
    uploads.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.goto(`/room-scan/${token}`);

  await expect(
    page.getByRole("heading", {
      name: "How would you like to measure this room?",
    }),
  ).toBeVisible();
  await expect(page.getByText("Primary bathroom remodel")).toBeVisible();
  const appLink = page.getByRole("link", { name: /Open LiDAR scanner app/ });
  await expect(appLink).toHaveAttribute(
    "href",
    new RegExp(`^premiumremodelfield://room-scan\\?.*token=${token}`),
  );

  await page.getByRole("button", { name: /Continue in browser/ }).click();
  await page.getByLabel("Room name").fill("Primary bathroom");
  await page.getByLabel("Width").fill("12");
  await page.getByLabel("Depth").fill("10");
  await page.getByLabel("Ceiling height").fill("9");
  await page.getByLabel("Doors").fill("1");
  await page.getByLabel("Windows").fill("2");
  await page.getByRole("button", { name: "Create room measurements" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Primary bathroom was added to the quote",
    }),
  ).toBeVisible({ timeout: 30_000 });
  expect(uploads.sort()).toEqual([
    "/test-upload/floor-plan.png",
    "/test-upload/room.usdz",
  ]);
  expect(savedCapture).toMatchObject({
    roomName: "Primary bathroom",
    measurements: {
      floorAreaSqFt: 120,
      wallAreaSqFt: 396,
      ceilingHeightFt: 9,
      perimeterFt: 44,
      widthFt: 12,
      depthFt: 10,
      doors: 1,
      windows: 2,
      openings: 0,
    },
  });
});
