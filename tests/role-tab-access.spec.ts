import { expect, test } from "@playwright/test";

test("owner workspace hides Door knocking and rejects its deep link", async ({
  page,
}) => {
  await page.goto("/demo?view=Door+knocking");
  await expect(page.getByRole("button", { name: "Door knocking" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Project overview." }),
  ).toBeVisible();
});

test("door knocker sees field tabs but cannot open an office tab", async ({
  page,
}) => {
  await page.goto("/demo?as=doorknocker&view=Quotes");
  await expect(page.getByRole("button", { name: "Quotes" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Door knocking." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Upcoming" })).toBeVisible();
});

test("role tab editor supports ordering, removing, and adding tabs", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await page.getByRole("button", { name: "Tab access by role" }).click();
  const access = page.getByRole("region", { name: "Tab access by role" });
  await expect(access.getByLabel("Role")).toHaveValue("admin");
  await expect(access).toContainText("LEFT NAVIGATION PREVIEW");
  await expect(access.getByText("Door knocking", { exact: true })).toHaveCount(
    0,
  );

  await access.getByRole("button", { name: "Configure tabs" }).click();
  let editor = page.getByRole("dialog", { name: "Configure Admin tabs" });
  const quotes = editor.locator(".role-tab-sort-row", { hasText: "Quotes" });
  const overview = editor.locator(".role-tab-sort-row", {
    hasText: "Overview",
  });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await quotes.dispatchEvent("dragstart", { dataTransfer: transfer });
  await overview.dispatchEvent("dragover", { dataTransfer: transfer });
  await overview.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    editor
      .getByRole("region", { name: "Workspace tabs" })
      .locator(".role-tab-sort-row")
      .first(),
  ).toContainText("Quotes");
  await editor.getByRole("button", { name: "Remove Quotes" }).click();
  await expect(editor.getByText("Quotes", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Add tabs" }).click();
  await editor.getByRole("menuitem", { name: "Quotes" }).click();
  await expect(editor.getByText("Quotes", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Done arranging" }).click();

  await access.getByLabel("Role").selectOption("doorknocker");
  await expect(access.getByText("Door knocking", { exact: true })).toBeVisible();
  await access.getByRole("button", { name: "Configure tabs" }).click();
  editor = page.getByRole("dialog", { name: "Configure Door knocker tabs" });
  await editor.getByRole("button", { name: "Add tabs" }).click();
  await expect(editor.getByRole("menuitem", { name: "Quotes" })).toHaveCount(
    0,
  );
});
