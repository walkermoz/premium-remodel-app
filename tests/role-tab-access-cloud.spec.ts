import { expect, test, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "saved role tab order controls the real workspace navigation",
  async ({ company, page }) => {
    const login = await page.request.post("/api/auth", {
      headers: origin,
      data: { action: "login", email: company.email, password },
    });
    expect(login.status()).toBe(200);

    const currentResponse = await page.request.get("/api/business-config");
    expect(currentResponse.status()).toBe(200);
    const config = await currentResponse.json();
    const ownerTabs = config.roleNavigation.owner as string[];
    config.roleNavigation.owner = [
      "Quotes",
      ...ownerTabs.filter((tab) => tab !== "Quotes"),
    ];

    const savedResponse = await page.request.put("/api/business-config", {
      headers: origin,
      data: config,
    });
    expect(savedResponse.status()).toBe(200);
    const saved = await savedResponse.json();
    expect(saved.roleNavigation.owner[0]).toBe("Quotes");

    await page.goto("/?view=Overview");
    const buttons = page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button");
    await expect(buttons.first()).toHaveText("Quotes");
    await expect(buttons.nth(1)).toHaveText("Overview");
  },
);
