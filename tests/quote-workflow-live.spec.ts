import { expect, test } from "@playwright/test";

test("real quote screen uses the staged workflow", async ({ page }) => {
  await page.goto("/demo?view=Quotes");
  await page.evaluate(() =>
    localStorage.removeItem("premium-remodel-sample-v1"),
  );
  await page.reload();

  await page.getByRole("button", { name: "New quote" }).first().click();
  await page.getByLabel("Quote name").fill("Workflow kitchen quote");
  await page.getByLabel("Contact name").fill("Taylor Reed");
  await page.getByLabel("Email").fill("taylor@example.com");
  await page
    .getByLabel("Address")
    .fill("1214 Willowbrook Drive, Cary, NC 27513");
  await page.getByRole("button", { name: "Create quote" }).click();

  const quoteId = new URL(page.url()).searchParams.get("project");
  expect(quoteId).toBeTruthy();
  await page.evaluate((id) => {
    const key = "premium-remodel-sample-v1";
    const workspace = JSON.parse(localStorage.getItem(key) || "{}");
    const now = new Date().toISOString();
    workspace.scope.push({
      id: crypto.randomUUID(),
      projectId: id,
      createdAt: now,
      updatedAt: now,
      sectionId: "workflow-kitchen",
      sectionName: "Kitchen",
      position: 0,
      title: "Cabinetry and installation",
      details: "Shaker cabinetry, hardware, and installation.",
      quantity: 1,
      unit: "job",
      estimate: 24500,
      subCost: 12000,
      materialCost: 6500,
      customerVisible: true,
      contractorId: "",
      status: "To do",
    });
    localStorage.setItem(key, JSON.stringify(workspace));
  }, quoteId);
  await page.reload();

  const workflow = page.getByRole("navigation", { name: "Quote workflow" });
  await expect(workflow).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Items, costs & pricing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "MSA preparation" }),
  ).toHaveCount(0);

  await workflow.getByRole("button", { name: /Documents/ }).click();
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await expect(
    workflow.getByRole("button", { name: /Company signatures/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Agreement preview" }),
  ).toBeVisible();
  await expect(page.getByText("This is preparation for the MSA")).toHaveCount(
    0,
  );
  await expect(page.getByText("Scope for Exhibit B")).toHaveCount(0);
  const signaturePad = page.getByRole("img", { name: "Draw your signature" });
  await signaturePad.scrollIntoViewIfNeeded();
  const signatureBounds = await signaturePad.boundingBox();
  expect(signatureBounds).not.toBeNull();
  await page.mouse.move(signatureBounds!.x + 20, signatureBounds!.y + 60);
  await page.mouse.down();
  await page.mouse.move(signatureBounds!.x + 150, signatureBounds!.y + 65);
  await page.mouse.up();
  await expect(signaturePad.locator("polyline")).toHaveCount(1);
  const clearSignature = page.getByRole("button", { name: "Clear signature" });
  const prepareMsa = page.getByRole("button", {
    name: "Sign and prepare MSA",
  });
  const clearBounds = await clearSignature.boundingBox();
  const prepareBounds = await prepareMsa.boundingBox();
  expect(clearBounds && prepareBounds).toBeTruthy();
  expect(
    prepareBounds!.y - (clearBounds!.y + clearBounds!.height),
  ).toBeGreaterThanOrEqual(12);
  await clearSignature.click();
  await expect(signaturePad.locator("polyline")).toHaveCount(0);
  await page.getByRole("button", { name: "Type name" }).click();
  const typedPreview = page.getByRole("img", {
    name: "Typed signature preview",
  });
  await expect(typedPreview).toBeVisible();
  const typedBounds = await typedPreview.boundingBox();
  const typedPrepareBounds = await prepareMsa.boundingBox();
  expect(typedBounds && typedPrepareBounds).toBeTruthy();
  expect(
    typedPrepareBounds!.y - (typedBounds!.y + typedBounds!.height),
  ).toBeGreaterThanOrEqual(12);
  await expect(
    page.getByRole("heading", { name: "Sign and send" }),
  ).toHaveCount(0);

  await workflow.getByRole("button", { name: /Customer signatures/ }).click();
  await expect(
    page.getByRole("heading", { name: "Customer signatures" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Customer packet" }),
  ).toContainText("Ready for customer");
  await expect(
    page.getByRole("button", { name: "Send portal link" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Master Services Agreement signing status",
    }),
  ).toContainText("Company signature required");
  await expect(
    workflow.getByRole("button", { name: /Create project/ }),
  ).toBeDisabled();
});
