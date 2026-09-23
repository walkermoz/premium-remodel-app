import { test, expect } from "@playwright/test";
import { contractClock, projectDates } from "../lib/project-timing";
import { demoWorkspace } from "../lib/demo";
import { emptyWorkspace, type Project } from "../lib/types";
import { schemas } from "../lib/schemas";

test("contract days handle first days, DST, holds, completion, and legacy records", () => {
  const sample = demoWorkspace().projects[0];
  const project: Project = {
    ...sample,
    startDate: "2024-03-09",
    endDate: "2024-12-01",
    status: "In progress",
  };
  expect(contractClock(project, "2024-03-09").days).toBe(1);
  expect(contractClock(project, "2024-03-11").days).toBe(3);
  expect(
    contractClock({ ...project, startDate: "2024-02-28" }, "2024-03-01").days,
  ).toBe(3);
  expect(
    contractClock({ ...project, status: "On hold" }, "2024-03-12").days,
  ).toBe(4);
  expect(
    contractClock({ ...project, status: "Planning" }, "2024-03-12").days,
  ).toBeNull();
  expect(contractClock(project, "2024-03-01").days).toBeNull();
  expect(contractClock({ ...project, startDate: "" }, "2024-03-12").label).toBe(
    "Add a start date",
  );
  const finished: Project = {
    ...project,
    status: "Completed",
    completedDate: "2024-03-12",
  };
  expect(contractClock(finished, "2025-05-10").days).toBe(4);
  expect(
    contractClock({ ...finished, completedDate: undefined }, "2025-05-10")
      .label,
  ).toBe("Add completion date");
  expect(
    projectDates({ ...project, startDate: "" }, undefined, "2024-03-09")
      .startDate,
  ).toBe("2024-03-09");
  expect(
    projectDates({ ...project, status: "Completed" }, project, "2024-03-12")
      .completedDate,
  ).toBe("2024-03-12");
  const legacy = { ...finished };
  delete legacy.completedDate;
  expect(projectDates(legacy, finished, "2025-05-10").completedDate).toBe(
    "2024-03-12",
  );
  expect(projectDates(legacy, legacy, "2025-05-10").completedDate).toBe("");
  expect(
    projectDates(
      { ...finished, status: "In progress" },
      finished,
      "2025-05-10",
    ),
  ).toMatchObject({ startDate: "2024-03-09", completedDate: "" });
  expect(
    schemas.project.safeParse({ ...finished, completedDate: "2024-03-08" })
      .success,
  ).toBe(false);
  expect(
    schemas.project.safeParse({ ...finished, completedDate: "2099-01-01" })
      .success,
  ).toBe(false);
});

test("a job starts its counter, updates across midnight, freezes, and resumes after reopening", async ({
  page,
}) => {
  const sample = demoWorkspace();
  const project = {
    ...sample.projects[3],
    name: "Contract clock kitchen",
    startDate: "",
    endDate: "",
    status: "Planning" as const,
  };
  await page.clock.install({ time: new Date("2026-09-09T16:00:00Z") });
  await page.addInitScript(
    (data) => {
      if (!localStorage.getItem("premium-remodel-sample-v1"))
        localStorage.setItem("premium-remodel-sample-v1", JSON.stringify(data));
    },
    { ...emptyWorkspace, projects: [project] },
  );
  await page.goto("/demo");
  const card = page.locator(".project-card");
  await expect(card.locator(".badge-planning")).toHaveCSS(
    "background-color",
    "rgb(253, 233, 231)",
  );
  await expect(card.locator(".contract-clock-compact")).toHaveText(
    "Not started",
  );
  await card.click();
  const clock = page.locator(".project-contract-clock");
  await page
    .getByLabel("Project status", { exact: true })
    .selectOption("In progress");
  await expect(clock).toContainText("1 day on contract");
  await expect(page.getByLabel("Project status", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(255, 243, 196)",
  );
  await page.clock.setSystemTime(new Date("2026-09-10T04:00:01Z"));
  await page.clock.fastForward(30001);
  await expect(clock).toContainText("2 days on contract");
  await page
    .getByLabel("Project status", { exact: true })
    .selectOption("Completed");
  await expect(clock).toContainText("2 days total");
  await expect(page.getByLabel("Project status", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(226, 243, 233)",
  );
  await page.clock.setSystemTime(new Date("2026-09-14T16:00:00Z"));
  await page.reload();
  await expect(clock).toContainText("2 days total");
  await page.getByRole("button", { name: "Edit project brief" }).click();
  await expect(page.getByLabel("Actual completion date")).toHaveValue(
    "2026-09-10",
  );
  await page.getByLabel("Client name").fill("Updated client");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(clock).toContainText("2 days total");
  await page
    .getByLabel("Project status", { exact: true })
    .selectOption("In progress");
  await expect(clock).toContainText("6 days on contract");
  await page
    .getByLabel("Project status", { exact: true })
    .selectOption("On hold");
  await expect(clock).toContainText("6 days on contract");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/project-contract-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
