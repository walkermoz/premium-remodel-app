import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("job notes keep drafts, save across reloads, appear in activity and stay with their job", async ({
  page,
}) => {
  await page.goto("/demo?view=Projects&project=p1");
  await page.getByRole("tab", { name: /^Notes/ }).click();
  const notes = page.getByRole("region", { name: "Job notes", exact: true });
  const input = notes.getByRole("textbox", { name: "New job note" });
  const save = notes.getByRole("button", { name: "Add note", exact: true });
  await expect(save).toBeDisabled();
  await input.fill("  ");
  await expect(save).toBeDisabled();
  const body =
    "Client prefers brushed nickel fixtures.\nConfirm tile selection before ordering.";
  await input.fill(body);
  await page.getByRole("tab", { name: /Scope & costs/ }).click();
  await page.getByRole("tab", { name: /^Notes/ }).click();
  await expect(input).toHaveValue(body);
  // A failed save must leave the draft available to retry.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (!failed && key === "premium-remodel-sample-v1") {
        failed = true;
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await save.click();
  await expect(notes.getByRole("alert")).toContainText(
    "Sample storage is full",
  );
  await expect(input).toHaveValue(body);
  await save.click();
  const note = notes
    .getByRole("article")
    .filter({ hasText: "Client prefers brushed nickel fixtures." });
  await expect(note).toHaveCount(1);
  await expect(note).toContainText("Alex Morgan");
  await expect(note.locator("time")).toHaveAttribute("datetime", /^\d{4}-/);
  await expect(note.locator("p")).toHaveText(body);
  await expect(input).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Notes/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(note).toHaveCount(1);
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(
    page.locator(".job-activity-entry").filter({ hasText: body }),
  ).toHaveCount(1);
  await page.goto("/demo?view=Projects&project=p2&tab=Notes");
  await expect(notes).toBeVisible();
  await expect(notes).not.toContainText(
    "Client prefers brushed nickel fixtures.",
  );
  await page.goBack();
  await page.getByRole("tab", { name: /^Notes/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await input.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/job-notes-mobile.png",
    fullPage: true,
  });
  await note.getByRole("button", { name: "Delete note", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete this note?" });
  await confirmation
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await expect(note).toHaveCount(0);
});

test("note photos and documents share project files and a failed note save reuses uploads", async ({
  page,
}) => {
  await page.goto("/demo?view=Projects&project=p1&tab=Notes");
  const notes = page.getByRole("region", { name: "Job notes", exact: true });
  const input = notes.getByLabel("Note attachments");
  await input.setInputFiles({
    name: "blocked.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg />"),
  });
  await expect(notes.getByRole("alert")).toContainText("Unsupported file");
  const photo = await sharp({
    create: { width: 320, height: 200, channels: 3, background: "#8dabaf" },
  })
    .png()
    .toBuffer();
  await input.setInputFiles([
    { name: "tile-photo.png", mimeType: "image/png", buffer: photo },
    {
      name: "measurements.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Wall: 10 feet"),
    },
  ]);
  // Fail the note write after both uploads have been saved.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (
        !failed &&
        key === "premium-remodel-sample-v1" &&
        JSON.parse(value).comments.some(
          (note: { attachmentIds?: string[] }) => note.attachmentIds?.length,
        )
      ) {
        failed = true;
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await notes.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(notes.getByRole("alert")).toContainText(
    "Uploaded files are already in Photos & files",
  );
  await notes.getByRole("button", { name: "Add note", exact: true }).click();
  const saved = notes
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name: "measurements.txt" }) });
  await expect(saved).toHaveCount(1);
  await saved.getByRole("button", { name: "View tile-photo.png" }).click();
  await expect(
    page.getByRole("dialog", { name: "tile-photo.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1")!),
  );
  expect(stored.attachments).toHaveLength(2);
  expect(
    stored.comments.filter(
      (note: { attachmentIds?: string[] }) => note.attachmentIds?.length,
    ),
  ).toHaveLength(1);
  await page.reload();
  await expect(saved).toHaveCount(1);
  await page.getByRole("tab", { name: /Photos & files/ }).click();
  await expect(page.locator(".file-item")).toHaveCount(2);
  await expect(page.locator(".files-panel")).toContainText("measurements.txt");
  await page
    .getByRole("button", { name: "Delete tile-photo.png", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page.getByRole("tab", { name: /^Notes/ }).click();
  await expect(saved).toContainText("Attachment removed");
  await expect(
    saved.getByRole("link", { name: "measurements.txt" }),
  ).toBeVisible();
});
