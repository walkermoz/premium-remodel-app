import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("quote photos can be selected, labeled, and removed without losing the upload", async ({
  page,
}) => {
  await page.goto("/demo?view=Quotes");
  await page.getByRole("button", { name: "New quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quote name").fill("Photo proposal");
  await dialog.getByLabel("Client name").fill("Test Homeowner");
  await dialog.getByRole("button", { name: "Create quote" }).click();

  await expect(
    page.getByRole("heading", { name: "Quote photos" }),
  ).toBeVisible();
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#8ba9b7" },
  })
    .jpeg()
    .toBuffer();
  await page.locator('.files-panel input[type="file"]').setInputFiles({
    name: "before-bath.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  const gallery = page.locator(".quote-photos-gallery");
  await expect(gallery.getByText("before-bath.jpg")).toBeVisible();
  await expect(gallery.getByText("0 of 8 selected")).toBeVisible();
  await expect(
    gallery.getByLabel("Photo type for before-bath.jpg").locator("option"),
  ).toHaveText(["Before photo", "Example photo"]);
  await gallery.getByRole("button", { name: "Include in quote" }).click();
  await expect(gallery.getByText("1 of 8 selected")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete before-bath.jpg" }),
  ).toBeDisabled();
  await gallery
    .getByLabel("Photo type for before-bath.jpg")
    .selectOption("example");
  await expect(
    gallery.getByLabel("Photo type for before-bath.jpg"),
  ).toHaveValue("example");
  await gallery
    .getByLabel("Caption for before-bath.jpg")
    .fill("Warm tile inspiration");
  await expect(
    gallery.getByRole("button", { name: "Save caption" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(
          localStorage.getItem("premium-remodel-sample-v1") || "{}",
        );
        return stored.quotes?.find(
          (quote: { name: string }) => quote.name === "Photo proposal",
        )?.quotePhotos?.[0]?.caption;
      }),
    )
    .toBe("Warm tile inspiration");
  await page.locator('.files-panel input[type="file"]').setInputFiles({
    name: "kitchen-before.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  const secondPhoto = gallery.locator(".quote-photo-item").filter({
    hasText: "kitchen-before.jpg",
  });
  await expect(
    secondPhoto.getByLabel("Photo type for kitchen-before.jpg"),
  ).toHaveValue("before");
  await secondPhoto.getByRole("button", { name: "Include in quote" }).click();
  await expect(gallery.getByText("2 of 8 selected")).toBeVisible();
  const overviewPhotos = page.locator(".quote-overview-photos");
  await expect(overviewPhotos.locator("img")).toHaveCount(2);
  await expect(overviewPhotos).toContainText("Before");
  await expect(overviewPhotos).toContainText("Example");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "test-results/quote-photos-review.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({
    path: "test-results/quote-photos-dark-review.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(gallery.getByText("2 of 8 selected")).toBeVisible();
  await expect(
    gallery.getByLabel("Photo type for before-bath.jpg"),
  ).toHaveValue("example");
  await expect(gallery.getByLabel("Caption for before-bath.jpg")).toHaveValue(
    "Warm tile inspiration",
  );
  await gallery
    .locator(".quote-photo-item")
    .filter({ hasText: "before-bath.jpg" })
    .getByRole("button", { name: "Remove from quote" })
    .click();
  await expect(overviewPhotos.locator("img")).toHaveCount(1);
  await secondPhoto.getByRole("button", { name: "Remove from quote" }).click();
  await expect(gallery.getByText("0 of 8 selected")).toBeVisible();
  await expect(gallery.getByText("before-bath.jpg")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete before-bath.jpg" }),
  ).toBeEnabled();
});
