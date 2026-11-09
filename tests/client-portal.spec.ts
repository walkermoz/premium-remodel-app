import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

test("unknown project portal links remain unavailable", async ({ page }) => {
  const response = await page.goto("/client/retired-project-token");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/client\/retired-project-token$/);
});

cloudTest(
  "project links require an existing project",
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
    ).toBe(404);
    expect(
      (
        await api.get(`/api/client-links?projectId=${id}&kind=project`)
      ).status(),
    ).toBe(404);
  },
);
