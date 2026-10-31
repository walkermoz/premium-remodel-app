import { expect, test } from "@playwright/test";
import { canCreateBusiness } from "@/lib/business-creation-access";

const owner = {
  role: "admin" as const,
  group: "owner" as const,
};

test("business owners can create organizations; staff cannot", () => {
  expect(canCreateBusiness(owner)).toBe(true);
  expect(canCreateBusiness({ ...owner, group: "office" })).toBe(false);
  expect(canCreateBusiness({ ...owner, role: "member" })).toBe(false);
});

test("business creation is available in workspace setup", async ({ page }) => {
  await page.goto("/demo?view=Settings");
  await expect(
    page.getByRole("heading", { name: "Get your business ready" }),
  ).toBeVisible();
});

test("non-administrators cannot see organization settings", async ({
  page,
}) => {
  await page.goto("/demo?as=doorknocker&view=Settings");
  const categories = page.getByRole("navigation", {
    name: "Settings categories",
  });
  await expect(
    categories.getByRole("button", { name: /Get started/ }),
  ).toHaveCount(0);
  await expect(
    categories.getByRole("button", { name: /Business/ }),
  ).toHaveCount(0);
  await expect(
    categories.getByRole("button", { name: /Connections/ }),
  ).toHaveCount(0);
  await expect(
    categories.getByRole("button", { name: /Workspace/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Get your business ready" }),
  ).toHaveCount(0);
  await categories.getByRole("button", { name: /My account/ }).click();
  await expect(
    page.getByRole("heading", { name: "Account security" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Google Calendar/ }),
  ).toBeVisible();
});
