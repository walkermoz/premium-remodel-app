import { expect, test } from "@playwright/test";

test("real quote screen uses the staged workflow", async ({ page }) => {
  await page.goto("/demo?view=Quotes");
  await page.evaluate(() =>
    localStorage.removeItem("premium-remodel-sample-v1"),
  );
  await page.reload();

  await page.getByRole("button", { name: "New quote" }).first().click();
  await page.getByLabel("Quote name").fill("Workflow kitchen quote");
  await page.getByLabel("Customer name").fill("Taylor Reed");
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
    page.getByRole("heading", { name: "Scope & pricing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "MSA preparation" }),
  ).toHaveCount(0);

  await workflow.getByRole("button", { name: /Agreement details/ }).click();
  await expect(
    page.getByRole("region", { name: "MSA preparation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Agreement preview" }),
  ).toBeVisible();
  const signaturePad = page.getByRole("img", { name: "Draw your signature" });
  await signaturePad.scrollIntoViewIfNeeded();
  const signatureBounds = await signaturePad.boundingBox();
  expect(signatureBounds).not.toBeNull();
  await page.mouse.move(signatureBounds!.x + 20, signatureBounds!.y + 60);
  await page.mouse.down();
  await page.mouse.move(signatureBounds!.x + 150, signatureBounds!.y + 65);
  await page.mouse.up();
  await expect(signaturePad.locator("polyline")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear signature" }).click();
  await expect(signaturePad.locator("polyline")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Sign and send" }),
  ).toHaveCount(0);

  await workflow.getByRole("button", { name: /Send & complete/ }).click();
  await expect(
    page.getByRole("heading", { name: "Send & complete" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email quote" }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Agreement signature status" }),
  ).toContainText("Sign and prepare the MSA in Agreement details");
  await expect(
    workflow.getByRole("button", { name: /Create project/ }),
  ).toBeDisabled();
});
