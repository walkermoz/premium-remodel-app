import { expect, test } from "@playwright/test";
import { canCreateBusiness } from "@/lib/business-creation-access";

const walker = {
  authUserId: "99d8fe1e-d455-4804-a285-a92b7ae610c4",
  email: "walker@premiumremodel.com",
  role: "admin" as const,
};

test("only Walker's personal account may create an organization", () => {
  expect(canCreateBusiness(walker)).toBe(true);
  expect(
    canCreateBusiness({
      ...walker,
      authUserId: "a3fc0703-a105-4414-9cef-6d7dc11cbb36",
    }),
  ).toBe(false);
  expect(
    canCreateBusiness({ ...walker, email: "contact@premiumremodel.com" }),
  ).toBe(false);
  expect(canCreateBusiness({ ...walker, role: "member" })).toBe(false);
});

test("business creation is absent from workspace settings", async ({
  page,
}) => {
  await page.goto("/demo?view=Settings");
  await expect(page.getByText("Add another business")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create business" }),
  ).toHaveCount(0);
});
