import { expect, test } from "@playwright/test";

test("quote separates pricing, configured paperwork, acceptance and project creation", async ({
  page,
}) => {
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
  await expect(workflow.getByRole("button")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toBeEnabled();
  await workflow.getByRole("button", { name: /Paperwork/ }).click();
  await expect(
    page.getByRole("heading", { name: "Paperwork", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add paperwork", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Paperwork hasn’t been configured", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "MSA preparation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Deposit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Document next step" }),
  ).toHaveCount(0);
  await page.getByLabel("Quote status").selectOption("Accepted");
  await expect(page.getByLabel("Quote status")).toHaveValue("Accepted");
  await expect(
    page.getByRole("button", { name: "Create project", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Quote status")).toHaveValue("Accepted");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await workflow.getByRole("button", { name: /Paperwork/ }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
