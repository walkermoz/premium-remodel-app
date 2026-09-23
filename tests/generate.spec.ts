import { test, expect } from "@playwright/test";
import {
  generationProjectTypes,
  renovationPrompt,
  stylesForProject,
} from "../lib/generation";

test("each project has appropriate styles and instructions for the photographed space", () => {
  for (const project of generationProjectTypes) {
    const styles = stylesForProject(project.id);
    expect(styles.length).toBeGreaterThanOrEqual(4);
    for (const style of styles) {
      const prompt = renovationPrompt(
        project.id,
        style.id,
        "Keep the existing windows",
        "Laundry room",
      );
      expect(prompt).toContain(project.context);
      expect(prompt).toContain("Keep the existing windows");
      expect(prompt).toContain("SAME space");
    }
  }
  expect(
    stylesForProject("deck").find((style) => style.id === "modern")
      ?.description,
  ).toContain("railings");
  expect(renovationPrompt("shed", "utility", "")).toContain("empty site");
  expect(renovationPrompt("other", "modern", "", "Laundry room")).toContain(
    "Project: Laundry room",
  );
  expect(() => renovationPrompt("deck", "spa", "")).toThrow();
});

test("Generate accepts photos, adapts styles, preserves drafts and saves a sample default", async ({
  page,
}) => {
  let paidRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate") && request.method() === "POST")
      paidRequests++;
  });
  await page.goto("/demo?view=Generate");
  await expect(page.getByRole("heading", { name: "Generate." })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate preview", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Upload project photo")
    .setInputFiles("public/images/kitchen.jpg");
  await expect(page.getByAltText("Your original project photo")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Project type", exact: true })
    .selectOption("deck");
  await expect(page.getByRole("radio")).toHaveCount(4);
  await expect(page.getByRole("radio", { name: /Warm spa/ })).toHaveCount(0);
  await page.getByText("Coastal", { exact: true }).click();
  await page.getByLabel("Additional details").fill("White railings");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Default image model")
    .selectOption("black-forest-labs/flux.2-pro");
  await page.getByRole("button", { name: "Save default model" }).click();
  await expect(
    page.getByText("Sample default saved in this browser."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Project type", exact: true }),
  ).toHaveValue("deck");
  await expect(page.getByLabel("Additional details")).toHaveValue(
    "White railings",
  );
  await expect(
    page
      .getByRole("combobox", { name: "Image model", exact: true })
      .locator("option:checked"),
  ).toContainText("FLUX.2 Pro");
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign in to your company workspace",
  );
  expect(paidRequests).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const canvas = await page.locator(".generate-canvas").boundingBox();
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/generate-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.reload();
  await expect(
    page
      .getByRole("combobox", { name: "Image model", exact: true })
      .locator("option:checked"),
  ).toContainText("FLUX.2 Pro");
});

test("unsupported photos and other project requirements are clear", async ({
  page,
}) => {
  await page.goto("/demo?view=Generate");
  await page.getByLabel("Upload project photo").setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("test"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a JPG, PNG or WebP",
  );
  await page
    .getByRole("combobox", { name: "Project type", exact: true })
    .selectOption("other");
  await expect(page.getByLabel("What are we working on?")).toHaveAttribute(
    "required",
    "",
  );
  await expect(page.getByLabel("Take project photo")).toHaveAttribute(
    "capture",
    "environment",
  );
});

test("public visitors cannot access generation or company settings", async ({
  request,
}) => {
  expect((await request.get("/api/generate/config")).status()).toBe(401);
  expect(
    (
      await request.post("/api/generate", {
        headers: { Origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch("/api/generate/config", {
        headers: { Origin: "http://localhost:3100" },
        data: { defaultModel: "openai/gpt-image-2" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/generate", {
        headers: { Origin: "https://unrelated.example" },
      })
    ).status(),
  ).toBe(403);
});
