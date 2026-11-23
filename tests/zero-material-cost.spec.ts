import { expect, test } from "@playwright/test";

for (const [basis, width] of [
  ["job", 1440],
  ["each", 390],
] as const) {
  test(`zero material cost stays visible and persists with ${basis} pricing`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo?view=Quotes");
    await page.getByRole("button", { name: "New quote" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New quote" });
    await dialog.getByLabel("Quote name").fill("Zero material cost");
    await dialog.getByLabel("Contact name").fill("Test Customer");
    await dialog.getByLabel("Email").fill("zero-cost@example.test");
    await dialog.getByRole("button", { name: "Create quote" }).click();
    await page.getByRole("button", { name: "Add Custom", exact: true }).click();
    const newRow = page.locator(".scope-new-row");
    await newRow.getByLabel("New item", { exact: true }).fill("Labor only");
    await newRow
      .getByLabel("Price per job for Labor only", { exact: true })
      .fill("500");
    await newRow
      .getByLabel("Subcontractor cost: Total cost for Labor only", {
        exact: true,
      })
      .fill("100");
    await newRow
      .getByLabel("Material cost basis for Labor only", { exact: true })
      .selectOption(basis);
    if (basis === "each")
      await newRow
        .getByLabel("Total items for material cost of Labor only", {
          exact: true,
        })
        .fill("3");
    const rateLabel = `Material cost: ${basis === "job" ? "Total cost" : "Cost per item"} for Labor only`;
    const material = newRow.getByLabel(rateLabel, { exact: true });
    await material.fill("25");
    await material.fill("");
    await expect(material).toHaveValue("");
    await material.pressSequentially("0");
    await expect(material).toHaveValue("0");
    await newRow
      .getByRole("button", { name: "Save item", exact: true })
      .click();
    await expect(newRow).toHaveCount(0);
    const toggle = page.getByRole("button", {
      name: "Edit Labor only",
      exact: true,
    });
    await expect(toggle).toContainText("$100");
    await expect(toggle).toContainText("$400");
    await page.reload();
    await toggle.click();
    const savedMaterial = page.getByLabel(rateLabel, { exact: true });
    await expect(savedMaterial).toHaveValue("0");
    // Zero must also remain a valid first keystroke when typing a sub-dollar cost.
    await savedMaterial.fill("");
    await savedMaterial.pressSequentially("0.25");
    await expect(savedMaterial).toHaveValue("0.25");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await toggle.click();
    await expect(savedMaterial).toHaveValue("0.25");
    await savedMaterial.fill("0");
    await expect(savedMaterial).toHaveValue("0");
    await toggle.click();
    await page.reload();
    await expect(toggle).toContainText("$100");
    await expect(toggle).toContainText("$400");
    await toggle.click();
    await expect(savedMaterial).toHaveValue("0");
    await expect(
      page.getByLabel("Price per job for Labor only", { exact: true }),
    ).toHaveValue("500");
    if (basis === "each")
      await expect(
        page.getByLabel("Total items for material cost of Labor only", {
          exact: true,
        }),
      ).toHaveValue("3");
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
    );
    expect(
      stored.scope.find(
        (item: { title: string }) => item.title === "Labor only",
      ),
    ).toMatchObject({ materialCost: 0, subCost: 100, estimate: 500 });
  });
}
