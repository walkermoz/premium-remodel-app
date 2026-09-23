import { test, expect } from "@playwright/test";

test("door-knocking map saves a visit, lead, and consultation", async ({
  page,
}) => {
  await page.goto("/demo?view=Door+knocking");
  await expect(
    page.getByRole("heading", { name: "Door knocking." }),
  ).toBeVisible();
  await expect(page.getByLabel("Door-knocking visits map")).toBeVisible();
  await expect(page.locator(".maplibregl-marker")).toHaveCount(3);

  await page.getByRole("button", { name: "Mark a house" }).click();
  const map = page.getByLabel("Door-knocking visits map");
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await map.click({
    position: {
      x: Math.round(box!.width * 0.58),
      y: Math.round(box!.height * 0.48),
    },
  });

  const dialog = page.getByRole("dialog", { name: "Mark this house" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("House address")
    .fill("410 Sample Oak Lane, Cary, NC 27513");
  await dialog.getByLabel("Create a lead").check();
  await dialog.getByLabel("First name").fill("Morgan");
  await dialog.getByLabel("Last name").fill("Lee");
  await dialog.getByLabel("Phone").fill("919-555-0188");
  await dialog.getByLabel("Interested in").selectOption("Deck");
  await dialog
    .getByLabel("Project request", { exact: true })
    .fill("Replace the rear deck and add covered seating.");
  await dialog.getByLabel("Schedule consultation").check();
  const quoteDate = new Date();
  quoteDate.setDate(quoteDate.getDate() + 3);
  const dateValue = `${quoteDate.getFullYear()}-${String(quoteDate.getMonth() + 1).padStart(2, "0")}-${String(quoteDate.getDate()).padStart(2, "0")}`;
  await dialog.getByLabel("Date").fill(dateValue);
  await dialog.getByLabel("Start").fill("14:30");
  await dialog.getByRole("button", { name: "Save visit & lead" }).click();

  await expect(
    page.getByText("Visit, lead, and consultation saved"),
  ).toBeVisible();
  await expect(
    page.getByText("410 Sample Oak Lane, Cary, NC 27513"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Upcoming" }).click();
  await expect(
    page.getByRole("button", {
      name: "Consultation · Morgan Lee",
      exact: true,
    }),
  ).toBeVisible();
});

test("door-knocking form requires a map position", async ({ page }) => {
  await page.goto("/demo?view=Door+knocking");
  await page.getByRole("button", { name: "Add by address" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark this house" });
  await dialog
    .getByLabel("House address")
    .fill("12 Manual Address, Raleigh, NC");
  await dialog.getByRole("button", { name: "Save visit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Choose an address suggestion",
  );
});
