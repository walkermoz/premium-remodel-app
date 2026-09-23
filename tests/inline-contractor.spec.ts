import { test, expect } from "@playwright/test";

test("create a contractor within work, preserve the draft, and save the assignment", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo?view=Upcoming&layout=List");
  await page.getByRole("button", { name: "Add work", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption("p1");
  await dialog
    .getByLabel("Work title")
    .fill("Inspect the new bathroom plumbing");
  await dialog
    .getByRole("combobox", { name: "Work type", exact: true })
    .selectOption("Inspection");
  await dialog.getByLabel("Scheduled date").fill("2026-10-15");
  await dialog.getByLabel("Start time", { exact: true }).fill("09:30");
  await dialog.getByLabel("End time", { exact: true }).fill("10:30");
  await dialog
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("High");
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("In progress");
  await dialog
    .getByLabel("Notes", { exact: true })
    .fill("Use the side entrance and check the upstairs bath.");
  await dialog
    .getByRole("combobox", { name: "Assigned contractor", exact: true })
    .selectOption("__new_contractor__");
  await expect(dialog).toHaveAccessibleName("New contractor");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByLabel("Work title")).not.toBeVisible();
  await expect(dialog.getByLabel("Contact name")).toBeFocused();
  await dialog.getByLabel("Contact name").fill("Taylor Plumbing");
  await dialog
    .getByLabel("Company", { exact: true })
    .fill("Taylor Services LLC");
  await dialog.getByLabel("Trade", { exact: true }).fill("Plumbing");
  await dialog.getByLabel("Email", { exact: true }).fill("taylor@example.com");
  await dialog.getByLabel("Phone", { exact: true }).fill("(919) 555-0142");
  await dialog
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Licensed plumber. Call before arrival.");
  await dialog
    .getByRole("button", { name: "Save & select contractor", exact: true })
    .click();
  await expect(dialog).toHaveAccessibleName("New work");
  const selected = dialog.getByRole("combobox", {
    name: "Assigned contractor",
    exact: true,
  });
  await expect(selected.locator("option:checked")).toHaveText(
    "Taylor Plumbing · Plumbing",
  );
  const contractorId = await selected.inputValue();
  await expect(selected).toBeFocused();
  await expect(dialog.getByLabel("Work title")).toHaveValue(
    "Inspect the new bathroom plumbing",
  );
  await expect(dialog.getByLabel("Scheduled date")).toHaveValue("2026-10-15");
  await expect(dialog.getByLabel("Start time", { exact: true })).toHaveValue(
    "09:30",
  );
  await expect(dialog.getByLabel("End time", { exact: true })).toHaveValue(
    "10:30",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Priority", exact: true }),
  ).toHaveValue("High");
  await expect(
    dialog.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue("In progress");
  await expect(dialog.getByLabel("Notes", { exact: true })).toHaveValue(
    "Use the side entrance and check the upstairs bath.",
  );
  await dialog
    .getByRole("button", { name: "Create work", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Inspect the new bathroom plumbing",
      exact: true,
    })
    .click();
  await expect(selected).toHaveValue(contractorId);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Contractors", exact: true }).click();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Taylor Plumbing", exact: true }),
  });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Taylor Services LLC");
  await expect(card).toContainText("Licensed plumber. Call before arrival.");
  await expect(
    card.getByRole("link", { name: "Call Taylor Plumbing" }),
  ).toHaveAttribute("href", "tel:9195550142");
  await expect(
    card.getByRole("link", { name: "taylor@example.com" }),
  ).toHaveAttribute("href", "mailto:taylor@example.com");
  await card
    .getByRole("button", { name: "Edit Taylor Plumbing", exact: true })
    .click();
  await expect(dialog.getByLabel("Phone", { exact: true })).toHaveValue(
    "(919) 555-0142",
  );
  await dialog
    .getByLabel("Company", { exact: true })
    .fill("Taylor Plumbing LLC");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(card).toContainText("Taylor Plumbing LLC");
  expect(errors).toEqual([]);
});

test("cancel and failed contractor saves keep the work draft intact on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?view=Projects&project=p1&tab=Upcoming&layout=List");
  await page.getByRole("button", { name: "Add work", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const assigned = dialog.getByRole("combobox", {
    name: "Assigned contractor",
    exact: true,
  });
  await assigned.selectOption("c2");
  await assigned.selectOption("__new_contractor__");
  await dialog.getByLabel("Contact name").fill("Cancelled contact");
  await dialog
    .getByRole("button", { name: "Back to work", exact: true })
    .click();
  await expect(assigned).toHaveValue("c2");
  await assigned.selectOption("__new_contractor__");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveAccessibleName("New work");
  await expect(assigned).toHaveValue("c2");
  await assigned.selectOption("__new_contractor__");
  await dialog.getByLabel("Contact name").fill("Retry Contractor");
  await dialog.getByLabel("Phone", { exact: true }).fill("919-555-0190");
  await dialog.getByLabel("Trade", { exact: true }).fill("Tiling");
  const save = dialog.getByRole("button", {
    name: "Save & select contractor",
    exact: true,
  });
  await save.focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Contact name")).toBeFocused();
  // Simulate one failed persistence attempt. No company data is involved.
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
  await expect(dialog.getByRole("alert")).toContainText(
    "Sample storage is full",
  );
  await expect(dialog.getByLabel("Contact name")).toHaveValue(
    "Retry Contractor",
  );
  await expect(dialog.getByLabel("Phone", { exact: true })).toHaveValue(
    "919-555-0190",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await dialog.getByLabel("Contact name").focus();
  await page.screenshot({
    path: "test-results/inline-contractor-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await save.click();
  await expect(dialog).toHaveAccessibleName("New work");
  await expect(assigned.locator("option:checked")).toHaveText(
    "Retry Contractor · Tiling",
  );
  // The unfinished task has no title yet; creating a contact must still work.
  await expect(dialog.getByLabel("Work title")).toHaveValue("");
  await expect(
    dialog.getByRole("combobox", { name: "Project", exact: true }),
  ).toHaveValue("p1");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("premium-remodel-sample-v1")!),
  );
  expect(
    data.contractors.filter(
      (c: { name: string }) => c.name === "Retry Contractor",
    ),
  ).toHaveLength(1);
  expect(
    data.contractors.some(
      (c: { name: string }) => c.name === "Cancelled contact",
    ),
  ).toBe(false);
  expect(
    data.tasks.some(
      (t: { contractorId: string }) =>
        t.contractorId === data.contractors[0].id,
    ),
  ).toBe(false);
});
