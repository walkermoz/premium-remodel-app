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

test("business settings show separate defaults for admin and door knocker", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  const access = page.getByText("Tab access by role").locator("..");
  await expect(access.getByLabel("Role")).toHaveValue("admin");
  await expect(access.getByLabel("Door knocking")).not.toBeChecked();
  await access.getByLabel("Role").selectOption("doorknocker");
  await expect(access.getByLabel("Door knocking")).toBeChecked();
  await expect(access.getByLabel("Quotes")).toBeDisabled();
});
