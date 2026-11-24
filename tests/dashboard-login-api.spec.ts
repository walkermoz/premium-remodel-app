import { test, expect, password } from "./supabase-fixture";
const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
cloud(
  "staff can sign in through an explicitly trusted alternate dashboard host",
  async ({ company, page }) => {
    const alias = "http://127.0.0.1:3100";
    await page.goto(`${alias}/login`);
    await page.getByLabel("Work email", { exact: true }).fill(company.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/auth" &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    expect((await response.json()).ok).toBe(true);
    await page.waitForURL(`${alias}/`);
    expect((await page.request.get(`${alias}/api/workspace`)).status()).toBe(
      200,
    );
    for (const origin of [
      "https://untrusted.example",
      "https://127.0.0.1.evil.example",
      "null",
    ]) {
      const rejected = await page.request.post(`${alias}/api/auth`, {
        headers: { Origin: origin },
        data: { action: "origin-diagnostic" },
      });
      expect(rejected.status()).toBe(403);
    }
    const noOrigin = await page.request.post(`${alias}/api/auth`, {
      data: { action: "origin-diagnostic" },
    });
    expect(noOrigin.status()).toBe(403);
    const allowed = await page.request.post(`${alias}/api/auth`, {
      headers: { Origin: alias },
      data: { action: "origin-diagnostic" },
    });
    expect(allowed.status()).toBe(400);
  },
);
