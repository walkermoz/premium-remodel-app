import { test, expect } from "@playwright/test";
import { demoWorkspace } from "../lib/demo";
import { schemas } from "../lib/schemas";
import { projectDates } from "../lib/project-timing";
import { homeownerScheduleSmsMessage } from "../lib/task-sms-message";

const sample = demoWorkspace();

test("a project controls the default time for homeowner alerts", () => {
  const project = {
    ...sample.projects[0],
    smsScheduleEnabled: true,
    smsScheduleTime: "09:00",
    contactId: sample.contacts[0].id,
  };
  expect(schemas.project.safeParse(project).success).toBe(true);
  expect(
    schemas.project.parse({ ...project, smsScheduleTime: undefined })
      .smsScheduleTime,
  ).toBe("09:00");
  expect(
    schemas.project.safeParse({ ...project, smsScheduleTime: "15:00" }).success,
  ).toBe(false);

  const legacyProject: Record<string, unknown> = { ...project };
  delete legacyProject.smsScheduleEnabled;
  delete legacyProject.smsScheduleTime;
  expect(projectDates(legacyProject, project)).toMatchObject({
    smsScheduleEnabled: true,
    smsScheduleTime: "09:00",
    contactId: sample.contacts[0].id,
  });
});

test("scheduled item text uses the homeowner and project address", () => {
  const task = {
    ...sample.tasks[0],
    title: "Morning shower prep",
    projectId: sample.projects[0].id,
    contractorId: sample.contractors[0].id,
    dueDate: "2026-11-20",
    startTime: "10:00",
    endTime: "11:00",
  };
  expect(schemas.task.safeParse(task).success).toBe(true);
  const homeownerMessage = homeownerScheduleSmsMessage(
    [task],
    sample.projects[0],
    sample.contacts[0],
    "Premium Remodel",
  );
  expect(homeownerMessage).toBe(
    "Hi Taylor, Premium Remodel has Morning shower prep scheduled for today at 10:00 AM at 214 Oakwood Avenue, Raleigh, NC. Reply if you have a question.",
  );
});

test("multiple scheduled items produce one homeowner message", () => {
  const tasks = [
    "Finish drywall and touchups",
    "Exterior touchups",
    "Patch roof, interior drywall, and paint",
  ].map((title, index) => ({
    ...sample.tasks[0],
    id: `item-${index}`,
    title,
    startTime: "",
  }));
  const project = {
    ...sample.projects[0],
    address: "1212 Willowbrook Dr Cary NC",
  };
  expect(
    homeownerScheduleSmsMessage(
      tasks,
      project,
      sample.contacts[0],
      "Premium Remodel",
    ),
  ).toBe(
    "Hi Taylor, Premium Remodel has these items scheduled for today at 1212 Willowbrook Dr Cary NC:\n- Finish drywall and touchups\n- Exterior touchups\n- Patch roof, interior drywall, and paint\nReply if you have a question.",
  );
});

test("project editor enables texts without a setting on each item", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("premium-remodel-sample-v1"))
      localStorage.setItem(
        "premium-remodel-sample-v1",
        JSON.stringify(workspace),
      );
  }, sample);
  await page.goto("/demo?view=Projects&project=p1&tab=Upcoming");
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Text homeowner" })
    .selectOption("homeowner");
  await dialog
    .getByRole("combobox", { name: "Homeowner contact" })
    .selectOption(sample.contacts[0].id);
  await expect(dialog.getByLabel(/Send at/)).toHaveValue("09:00");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Homeowner texts · 9:00 AM")).toBeVisible();

  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await dialog.getByLabel("Item title").fill("Morning shower prep");
  await dialog.getByLabel("Due date").fill("2026-11-20");
  await dialog.getByLabel("Start time", { exact: true }).fill("10:00");
  await dialog
    .getByRole("combobox", { name: "Assigned trade contact", exact: true })
    .selectOption(sample.contractors[0].id);
  await expect(dialog.getByText("Schedule notifications")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Create item", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const calendar = page.getByRole("region", { name: "Project calendar" });
  await calendar
    .getByRole("table")
    .locator('[data-date="2026-11-20"] .calendar-day-number')
    .click();
  await expect(
    calendar.getByRole("region", { name: "Selected day schedule" }),
  ).toContainText("Included in homeowner text at 9:00 AM");
});
