import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

test("legacy project links open the new portal sign-in", async ({ page }) => {
  await page.goto("/client/retired-project-token");
  await expect(page).toHaveURL(/\/client\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Sign in with your email" }),
  ).toBeVisible();
});

cloudTest(
  "administrators cannot create legacy project links",
  async ({ company, page }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const id = "00000000-0000-4000-8000-000000000000";

    expect(
      (
        await api.post("/api/client-links", {
          headers: origin,
          data: { projectId: id, kind: "project" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await api.get(`/api/client-links?projectId=${id}&kind=project`)
      ).status(),
    ).toBe(400);
  },
);
