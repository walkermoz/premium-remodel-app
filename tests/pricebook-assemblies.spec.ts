import { expect, test } from "@playwright/test";
import {
  assemblyInput,
  mapPricebookAssembly,
} from "../lib/pricebook-assemblies";

const component = {
  pricebookItemId: "abc00000-0000-4000-8000-000000000001",
  quantity: 12,
};

test("assemblies keep ordered components and quantities", () => {
  const assembly = mapPricebookAssembly({
    id: "abc00000-0000-4000-8000-000000000002",
    revision: 2,
    active: true,
    name: "Bathroom refresh",
    description: "",
    category: "Bathrooms",
    components: [component, { ...component, quantity: 4 }],
  });
  expect(assembly.components.map((part) => part.quantity)).toEqual([12, 4]);
  expect(assembly.revision).toBe(2);
  expect(assemblyInput.safeParse({ ...assembly, components: [] }).success).toBe(
    false,
  );
  expect(
    assemblyInput.safeParse({
      ...assembly,
      components: [{ ...component, quantity: -1 }],
    }).success,
  ).toBe(false);
});

test("a price-book assembly can be reused as an editable quote project in the demo", async ({
  page,
}) => {
  await page.goto("/demo?view=Price+book");
  await page.getByRole("button", { name: "Assemblies" }).click();
  await page.getByRole("button", { name: "New assembly" }).click();
  const editor = page.getByRole("dialog", { name: "Assembly editor" });
  await editor.getByLabel("Project name").fill("Tile project");
  await editor.getByRole("button", { name: "Add work item" }).click();
  await editor.getByLabel("Quantity").fill("25");
  await editor.getByLabel("Contractor").selectOption("c5");
  await editor.getByRole("button", { name: "Save assembly" }).click();
  await expect(editor).toBeHidden();
  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await page.getByRole("button", { name: "New quote" }).first().click();
  const quoteEditor = page.getByRole("dialog", { name: "New quote" });
  await quoteEditor.getByLabel("Quote name").fill("Assembly test quote");
  await quoteEditor.getByLabel("Contact name").fill("Sample Client");
  await quoteEditor.getByLabel("Email").fill("sample@example.com");
  await quoteEditor.getByRole("button", { name: "Create quote" }).click();
  await page.getByRole("button", { name: "Use assembly" }).click();
  const picker = page.getByRole("dialog", { name: "Use price-book assembly" });
  await expect(picker).toContainText("Tile project");
  await picker.getByRole("button", { name: "Add to quote" }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByText("Tile project", { exact: true })).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
  );
  const quote = stored.quotes.find(
    (entry: { name: string }) => entry.name === "Assembly test quote",
  );
  const rows = stored.scope.filter(
    (entry: { projectId: string }) => entry.projectId === quote.id,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    sectionName: "Tile project",
    estimate: 700,
    quantity: 25,
  });
});
