import { expect, test } from "@playwright/test";
import { openSettingsSection } from "./settings-helpers";
import { defaultOperatingSettings } from "@/lib/operating-settings";
import { demoWorkspace } from "@/lib/demo";

test("working hours, invoice, message and portal editors persist separate settings without losing drafts", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings#working-hours");
  await page
    .getByLabel("Show working hours in the customer portal", { exact: true })
    .check();
  await expect(
    page.getByLabel("Block bookings outside working hours"),
  ).toHaveCount(0);
  await page.getByLabel("Monday opens").fill("09:30");
  await openSettingsSection(page, "Invoice defaults");
  await page
    .getByLabel("Invoice title", { exact: true })
    .fill("Project balance invoice");
  await page.getByLabel("Default deposit (%)").fill("30");
  await page.getByLabel("Deposit due days after signing").fill("7");
  await page
    .getByRole("button", { name: "Save invoice defaults", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved sample");
  await openSettingsSection(page, "Working hours");
  await expect(page.getByLabel("Monday opens")).toHaveValue("09:30");
  await page
    .getByRole("button", { name: "Save working hours", exact: true })
    .click();
  await openSettingsSection(page, "Message templates");
  await page
    .getByLabel("Lead acknowledgement subject", { exact: true })
    .fill("Thanks, {{firstName}}");
  await page
    .getByRole("button", { name: "Save message templates", exact: true })
    .click();
  await openSettingsSection(page, "Customer portal");
  await page.getByLabel("Online payments and payment methods").uncheck();
  await page.getByLabel("Appointment times in the schedule").uncheck();
  await page
    .getByRole("button", { name: "Save portal visibility", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByLabel("Online payments and payment methods"),
  ).not.toBeChecked();
  await openSettingsSection(page, "Invoice defaults");
  await expect(page.getByLabel("Default deposit (%)")).toHaveValue("30");
  await openSettingsSection(page, "Working hours");
  await expect(page.getByLabel("Monday opens")).toHaveValue("09:30");
  await openSettingsSection(page, "Message templates");
  await expect(
    page.getByLabel("Lead acknowledgement subject", { exact: true }),
  ).toHaveValue("Thanks, {{firstName}}");
});
test("a saved custom field is available on the project editor and is saved on the record", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings#custom-fields");
  await page
    .getByRole("button", { name: "Add custom field", exact: true })
    .click();
  await page
    .getByLabel("Field label", { exact: true })
    .fill("Site access code");
  await page.getByLabel("Required", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save custom fields", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved sample");
  await page.goto("/demo?view=Projects&project=p1");
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Site access code").fill("Side entrance 1234");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect(
    page.getByText("Side entrance 1234", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Side entrance 1234", { exact: true }),
  ).toBeVisible();
});
test("reusable forms can be assigned, saved as drafts and completed without changing their snapshots", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings#forms");
  await page
    .getByRole("button", { name: "Add reusable form", exact: true })
    .click();
  await page.getByLabel("Form title", { exact: true }).fill("Site check");
  await page.getByLabel("Field label", { exact: true }).fill("Access notes");
  await page.getByLabel("Required", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save reusable forms", exact: true })
    .click();
  await page.goto("/demo?view=Projects&project=p1&tab=Forms");
  await page
    .getByRole("combobox", { name: "Reusable form", exact: true })
    .selectOption({ label: "Site check" });
  await page.getByRole("button", { name: "Assign form", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete form", exact: true })
    .click();
  await expect(
    page.getByText("Access notes is required.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByLabel("Access notes").fill("Use side entrance");
  await page
    .getByRole("button", { name: "Complete form", exact: true })
    .click();
  await expect(page.getByLabel("Access notes")).toBeDisabled();
  await expect(page.getByText(/Completed by/)).toBeVisible();
  await page.goto("/demo?view=Settings#forms");
  await page
    .getByLabel("Field label", { exact: true })
    .fill("Changed future question");
  await page
    .getByRole("button", { name: "Save reusable forms", exact: true })
    .click();
  await page.goto("/demo?view=Projects&project=p1&tab=Forms");
  await expect(page.getByLabel("Access notes")).toHaveValue(
    "Use side entrance",
  );
});
test("mobile operating settings keep controls inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?view=Settings#working-hours");
  for (const section of [
    "Working hours",
    "Custom fields",
    "Reusable forms",
    "Invoice defaults",
    "Message templates",
    "Customer portal",
  ]) {
    await openSettingsSection(page, section);
    await expect(
      page.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("displayed business hours do not prevent rescheduling or completing work", async ({
  page,
}) => {
  const settings = defaultOperatingSettings();
  settings.hours.enabled = true;
  settings.hours.blockOutside = true;
  settings.hours.days = settings.hours.days.map((d) => ({ ...d, open: false }));
  const w = demoWorkspace();
  w.tasks[0].dueDate = "2026-11-23";
  w.tasks[0].status = "To do";
  w.tasks[0].startTime = "09:00";
  w.tasks[0].endTime = "10:00";
  await page.addInitScript(
    ({ settings, w }) => {
      localStorage.setItem(
        "servicebuddy-operating-settings-demo-v1",
        JSON.stringify({ settings, revision: 1 }),
      );
      localStorage.setItem("premium-remodel-sample-v1", JSON.stringify(w));
    },
    { settings, w },
  );
  await page.goto("/demo?view=Projects&project=p1&tab=Upcoming&layout=List");
  await page
    .getByRole("button", { name: `Edit ${w.tasks[0].title}`, exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await modal.locator('input[name="startTime"]').fill("09:30");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  const changedTime = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("premium-remodel-sample-v1")!).tasks.find(
        (task: { id: string }) => task.id === id,
      ).startTime,
    w.tasks[0].id,
  );
  expect(changedTime).toBe("09:30");
  await page
    .getByRole("button", { name: `Edit ${w.tasks[0].title}`, exact: true })
    .click();
  await modal
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("Done");
  await modal
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  const status = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("premium-remodel-sample-v1")!).tasks.find(
        (t: { id: string }) => t.id === id,
      ).status,
    w.tasks[0].id,
  );
  expect(status).toBe("Done");
});
