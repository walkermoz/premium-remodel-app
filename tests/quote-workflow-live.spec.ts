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
  await expect(workflow.getByRole("button")).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Next required action" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Customer packet" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "MSA preparation" }),
  ).toHaveCount(0);
  await expect(page.locator(".quote-document-row")).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Deposit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Document next step" }),
  ).toContainText("Prepare your service agreement");
  await expect(page.getByText("Total costs", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Prepare agreement", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Prepare service agreement",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Type name", exact: true }),
  ).toBeDisabled();
  await editor
    .getByLabel("Excluded work")
    .fill("Work outside the listed scope is excluded.");
  await editor
    .getByLabel("Material allowances")
    .fill("No material allowances.");
  await editor
    .getByRole("button", { name: "Save agreement details", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Type name", exact: true }),
  ).toBeEnabled();
  await expect(
    editor.getByLabel("Company representative print name"),
  ).toBeVisible();
  await expect(
    editor.getByLabel("Signing staff member", { exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("heading", { name: "Agreement preview" }),
  ).toBeHidden();
  await editor.getByText("Preview full agreement", { exact: true }).click();
  await expect(
    editor.getByRole("heading", { name: "Agreement preview" }),
  ).toBeVisible();
  const signaturePad = editor.getByRole("img", { name: "Draw your signature" });
  await signaturePad.scrollIntoViewIfNeeded();
  const bounds = await signaturePad.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 20, bounds!.y + 60);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 150, bounds!.y + 65);
  await page.mouse.up();
  await expect(signaturePad.locator("polyline")).toHaveCount(1);
  await editor.getByRole("button", { name: "Clear signature" }).click();
  await expect(signaturePad.locator("polyline")).toHaveCount(0);
  await editor.getByRole("button", { name: "Type name", exact: true }).click();
  await expect(
    editor.getByRole("img", { name: "Typed signature preview" }),
  ).toBeVisible();
  // Sample signatures cannot accidentally submit to the company's backend.
  await expect(
    editor.getByRole("button", { name: "Sign and prepare agreement" }),
  ).toBeDisabled();
  await editor
    .getByRole("button", { name: "Close agreement preparation" })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Master Services Agreement signing status",
    }),
  ).toContainText("Needs preparation");
  await expect(
    page.getByRole("button", { name: "Sign quote on this device" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send for signature" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Prepare agreement", exact: true })
    .click();
  await expect(editor).toBeVisible();
  expect(
    await editor.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Prepare agreement", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  // Missing contact data should explain the next action, rather than show
  // several disabled signature buttons without a clear way forward.
  await page.evaluate((id) => {
    const key = "premium-remodel-sample-v1";
    const workspace = JSON.parse(localStorage.getItem(key) || "{}");
    workspace.quotes.find(
      (item: { id: string }) => item.id === id,
    ).clientEmail = "";
    localStorage.setItem(key, JSON.stringify(workspace));
  }, quoteId);
  await page.reload();
  await workflow.getByRole("button", { name: /Documents/ }).click();
  await expect(
    page.getByRole("button", { name: "Add customer email", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("region", { name: "Document next step" }),
  ).toContainText("An email is needed");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
