import { test, expect, type Page } from "@playwright/test";
import { demoWorkspace } from "../lib/demo";
import { emptyWorkspace, type Workspace } from "../lib/types";
import { calendarDays, shiftMonth, validCalendarDate } from "../lib/calendar";
import { calendarEntries } from "../lib/calendar";
import { groupUpcoming, preserveWorkSchedule, workToday } from "../lib/work";
import { schemas } from "../lib/schemas";

test.use({ timezoneId: "America/New_York" });

function calendarFixture(): Workspace {
  const sample = demoWorkspace();
  return {
    ...emptyWorkspace,
    contractors: sample.contractors,
    projects: [
      {
        ...sample.projects[0],
        name: "Kitchen",
        startDate: "2026-09-09",
        endDate: "2026-09-30",
      },
      {
        ...sample.projects[1],
        name: "Bathroom",
        startDate: "2026-09-10",
        endDate: "2026-10-02",
      },
    ],
    tasks: [
      {
        ...sample.tasks[0],
        id: "inspection",
        projectId: "p1",
        title: "Kitchen inspection",
        dueDate: "2026-09-09",
        status: "To do",
      },
      {
        ...sample.tasks[0],
        id: "delivery",
        projectId: "p1",
        title: "Appliance delivery",
        dueDate: "2026-09-09",
        status: "To do",
      },
      {
        ...sample.tasks[0],
        id: "tile",
        projectId: "p2",
        title: "Bathroom tile",
        dueDate: "2026-09-09",
        status: "To do",
      },
      {
        ...sample.tasks[0],
        id: "done",
        projectId: "p1",
        title: "Finished demolition",
        dueDate: "2026-09-09",
        status: "Done",
      },
      {
        ...sample.tasks[0],
        id: "undated",
        projectId: "p1",
        title: "Choose cabinet handles",
        dueDate: "",
        status: "To do",
      },
    ],
  };
}

async function seed(page: Page, workspace = calendarFixture()) {
  await page.clock.setFixedTime(new Date("2026-09-09T16:00:00Z"));
  await page.addInitScript((data) => {
    if (!localStorage.getItem("premium-remodel-sample-v1"))
      localStorage.setItem("premium-remodel-sample-v1", JSON.stringify(data));
  }, workspace);
}

test("workspace calendar combines projects, filters work, and navigates dates", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/demo?view=Upcoming");
  const calendar = page.getByRole("region", {
    name: "Workspace calendar",
    exact: true,
  });
  const grid = calendar.getByRole("table");
  const selected = calendar.getByRole("region", {
    name: "Selected day schedule",
  });
  await expect(grid).toHaveAccessibleName("September 2026 calendar");
  await expect(selected).toContainText("4 scheduled items");
  await expect(
    selected.getByRole("button", { name: "Kitchen inspection", exact: true }),
  ).toBeVisible();
  await expect(
    selected.getByRole("button", { name: "Bathroom tile", exact: true }),
  ).toBeVisible();
  await expect(selected).not.toContainText("Finished demolition");
  await expect(
    grid.getByRole("button", { name: "+1 more", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Work status").selectOption("All work");
  await expect(
    selected.getByRole("button", { name: "Finished demolition", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter by project").selectOption("p1");
  await expect(calendar).not.toContainText("Bathroom tile");
  await expect(selected).toContainText("Kitchen inspection");
  await calendar.getByLabel("Jump to month").fill("2026-12");
  await calendar
    .getByRole("button", { name: "Next month", exact: true })
    .click();
  await expect(grid).toHaveAccessibleName("January 2027 calendar");
  await calendar
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(grid).toHaveAccessibleName("December 2026 calendar");
  await calendar.getByRole("button", { name: "Today", exact: true }).click();
  await expect(grid).toHaveAccessibleName("September 2026 calendar");
  await expect(selected).toContainText("September 9, 2026");
  await selected
    .getByRole("button", { name: "Kitchen", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/project=p1&tab=Upcoming&layout=Calendar/);
  await expect(page.getByRole("tab", { name: /^Upcoming/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("region", { name: "Project calendar", exact: true }),
  ).not.toContainText("Bathroom tile");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Upcoming.", exact: true }),
  ).toBeVisible();
});

test("project calendar creates dated tasks, moves deadlines, and preserves the tab", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/demo?view=Projects&project=p1&tab=Upcoming");
  const calendar = page.getByRole("region", {
    name: "Project calendar",
    exact: true,
  });
  const grid = calendar.getByRole("table");
  const selected = calendar.getByRole("region", {
    name: "Selected day schedule",
  });
  await grid.locator('[data-date="2026-09-12"] .calendar-day-number').click();
  await page.getByRole("button", { name: "Add work", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Due date")).toHaveValue("2026-09-12");
  await expect(
    dialog.getByRole("combobox", { name: "Project", exact: true }),
  ).toHaveValue("p1");
  await dialog.getByLabel("Work title").fill("Deliver cabinets");
  await dialog
    .getByRole("button", { name: "Create work", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(grid.locator('[data-date="2026-09-12"]')).toContainText(
    "Deliver cabinets",
  );
  await selected
    .getByRole("button", { name: "Deliver cabinets", exact: true })
    .click();
  await dialog.getByLabel("Due date").fill("2026-09-13");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(grid.locator('[data-date="2026-09-12"]')).not.toContainText(
    "Deliver cabinets",
  );
  await expect(grid.locator('[data-date="2026-09-13"]')).toContainText(
    "Deliver cabinets",
  );
  await grid.locator('[data-date="2026-09-13"] .calendar-day-number').click();
  await selected
    .getByRole("button", { name: "Complete Deliver cabinets", exact: true })
    .click();
  await expect(selected).not.toContainText("Deliver cabinets");
  await page.getByLabel("Work status").selectOption("All work");
  await selected
    .getByRole("button", { name: "Reopen Deliver cabinets", exact: true })
    .click();
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Upcoming/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(grid.locator('[data-date="2026-09-13"]')).toContainText(
    "Deliver cabinets",
  );
  await calendar.locator("summary").click();
  await calendar
    .getByRole("button", { name: "Choose cabinet handles", exact: true })
    .click();
  await expect(dialog.getByLabel("Due date")).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("tab", { name: /^Upcoming/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await grid.locator('[data-date="2026-09-13"] .calendar-day-number').click();
  await expect(
    selected.getByRole("button", { name: "Deliver cabinets", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/calendar-project-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("empty workspace calendar remains usable on phones", async ({ page }) => {
  await seed(page, emptyWorkspace);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?view=Calendar");
  await expect(
    page.getByText("Create a project to start scheduling work."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add work", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("calendar days handle leap years, year boundaries, and daylight saving", () => {
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  expect(validCalendarDate("2028-02-29")).toBe(true);
  expect(validCalendarDate("2026-02-29")).toBe(false);
  expect(validCalendarDate("")).toBe(false);
  const march = calendarDays("2026-03");
  expect(march).toHaveLength(42);
  expect(new Set(march).size).toBe(42);
  expect(march.slice(6, 10)).toEqual([
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
    "2026-03-10",
  ]);
  expect(calendarDays("2028-02")).toContain("2028-02-29");
});

test("Upcoming groups work, retains filters across views, and supports legacy task links", async ({
  page,
}) => {
  const data = calendarFixture();
  data.tasks[0] = {
    ...data.tasks[0],
    workType: "Inspection",
    startTime: "09:00",
    endTime: "10:00",
  };
  data.tasks[1] = {
    ...data.tasks[1],
    workType: "Delivery",
    dueDate: "2026-09-08",
  };
  await seed(page, data);
  await page.goto("/demo?view=Tasks");
  const panel = page.getByRole("region", { name: "Workspace upcoming work" });
  await panel.getByRole("button", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Upcoming.", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("region", { name: "Overdue", exact: true }),
  ).toContainText("Appliance delivery");
  await expect(
    panel.getByRole("region", { name: "Today", exact: true }),
  ).toContainText("9:00 AM–10:00 AM");
  await expect(
    panel.getByRole("region", { name: "Unscheduled", exact: true }),
  ).toContainText("Choose cabinet handles");
  await expect(panel).not.toContainText("Finished demolition");
  await page.getByLabel("Filter by project").selectOption("p1");
  await page.getByLabel("Filter by work type").selectOption("Inspection");
  await panel.getByRole("button", { name: "Add work", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Work type", exact: true }),
  ).toHaveValue("Inspection");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(panel).not.toContainText("Bathroom tile");
  await expect(panel).not.toContainText("Appliance delivery");
  await panel.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(panel.getByRole("table")).toContainText("9:00 AM–10:00 AM");
  await expect(panel.getByRole("table")).not.toContainText("Bathroom tile");
  await panel.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByLabel("Filter by work type")).toHaveValue(
    "Inspection",
  );
  await page.getByLabel("Search upcoming work").fill("missing work");
  await expect(panel.getByText("No work matches these filters")).toBeVisible();
  await panel
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/upcoming-list-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("scheduled work saves times, validates ranges, and can be completed and removed", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/demo?view=Upcoming&layout=List");
  const panel = page.getByRole("region", { name: "Workspace upcoming work" });
  await panel.getByRole("button", { name: "Add work", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Project", exact: true })
    .selectOption("p2");
  await dialog.getByLabel("Work title").fill("Cabinet delivery");
  await dialog
    .getByRole("combobox", { name: "Work type", exact: true })
    .selectOption("Delivery");
  await dialog.getByLabel("Scheduled date").fill("2026-09-10");
  await dialog.getByLabel("Start time", { exact: true }).fill("13:00");
  await dialog.getByLabel("End time", { exact: true }).fill("12:00");
  await dialog
    .getByRole("button", { name: "Create work", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "End time must be later",
  );
  await dialog.getByLabel("End time", { exact: true }).fill("15:00");
  await dialog
    .getByRole("button", { name: "Create work", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    panel.getByRole("region", { name: "This week", exact: true }),
  ).toContainText("1:00 PM–3:00 PM");
  await page.reload();
  await panel
    .getByRole("button", { name: "Cabinet delivery", exact: true })
    .click();
  await expect(dialog.getByLabel("Start time", { exact: true })).toHaveValue(
    "13:00",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Work type", exact: true }),
  ).toHaveValue("Delivery");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await panel.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(
    panel.getByRole("table").locator('[data-date="2026-09-10"]'),
  ).toContainText("1:00 PM–3:00 PM");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel
    .getByRole("table")
    .locator('[data-date="2026-09-10"] .calendar-day-number')
    .click();
  const selected = panel.getByRole("region", { name: "Selected day schedule" });
  await expect(selected).toContainText("Delivery · 1:00 PM–3:00 PM");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/upcoming-calendar-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  await selected
    .getByRole("button", { name: "Complete Cabinet delivery", exact: true })
    .click();
  await panel.getByLabel("Work status").selectOption("Completed");
  await expect(selected).toContainText("Cabinet delivery");
  await panel.getByRole("button", { name: "List", exact: true }).click();
  await panel
    .getByRole("button", { name: "Delete Cabinet delivery", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Cabinet delivery", exact: true }),
  ).toHaveCount(0);
});

test("work scheduling validates stored data and keeps older tasks compatible", () => {
  const oldTask = calendarFixture().tasks[0];
  const parsed = schemas.task.parse(oldTask);
  expect(parsed.workType).toBe("Task");
  expect(parsed.startTime).toBe("");
  const visit = {
    ...oldTask,
    workType: "Inspection" as const,
    startTime: "09:00",
    endTime: "10:00",
  };
  for (const bad of [
    { startTime: "25:00" },
    { endTime: "09:00" },
    { endTime: "08:00" },
    { dueDate: "" },
    { startTime: "" },
    { workType: "Unknown" },
  ])
    expect(schemas.task.safeParse({ ...visit, ...bad }).success).toBe(false);
  expect(
    schemas.task.parse(
      preserveWorkSchedule(
        { ...oldTask, title: "Updated by older browser" },
        visit,
      ),
    ),
  ).toMatchObject({
    workType: "Inspection",
    startTime: "09:00",
    endTime: "10:00",
  });
  expect(
    schemas.task.parse(
      preserveWorkSchedule({ ...visit, startTime: "", endTime: "" }, visit),
    ).startTime,
  ).toBe("");
  expect(workToday(new Date("2026-09-10T01:00:00Z"))).toBe("2026-09-09");
  expect(workToday(new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-08");
  const data = calendarFixture();
  data.projects[0].startDate = "2026-09-01";
  data.tasks[0].dueDate = "2026-09-14";
  const groups = new Map(
    groupUpcoming(calendarEntries(data, "", true, true), "2026-09-09"),
  );
  expect(
    groups.get("Later")?.some((entry) => entry.title === "Kitchen inspection"),
  ).toBe(true);
  expect(
    groups
      .get("Completed")
      ?.some((entry) => entry.title === "Finished demolition"),
  ).toBe(true);
  expect(
    groups.get("Overdue")?.some((entry) => entry.kind === "start"),
  ).not.toBe(true);
});
