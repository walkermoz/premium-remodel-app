import { test, expect } from "@playwright/test";
test("a saved quote creates a linked project without a signature or deposit wizard", async ({
  page,
}) => {
  await page.goto(
    "/demo?scenario=quote-project-handoff&view=Quotes&project=quote-project-handoff-demo",
  );
  await expect(
    page.getByRole("heading", {
      name: "Willowbrook kitchen remodel",
      exact: true,
    }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Quote workflow" });
  await expect(navigation.getByRole("button")).toHaveCount(2);
  await expect(
    navigation.getByRole("button", {
      name: /Deposit|Create project|Customer signatures/,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create project",
    exact: true,
  });
  await expect(dialog).toContainText(
    "Outstanding paperwork and payments can be completed later",
  );
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page).toHaveURL(/view=Projects&project=/);
  await expect(
    page.getByRole("heading", {
      name: "Willowbrook kitchen remodel",
      exact: true,
    }),
  ).toBeVisible();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1") || "{}"),
  );
  const original = state.quotes.find(
    (quote: { id: string }) => quote.id === "quote-project-handoff-demo",
  );
  expect(original.linkedProjectId).toBeTruthy();
  expect(
    state.projects.find(
      (project: { id: string }) => project.id === original.linkedProjectId,
    ).sourceQuoteId,
  ).toBe(original.id);
  expect(
    state.scope.filter(
      (item: { projectId: string }) =>
        item.projectId === original.linkedProjectId,
    ).length,
  ).toBeGreaterThan(0);
});
