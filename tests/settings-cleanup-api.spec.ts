import { readFile } from "node:fs/promises";
import { test, expect, password } from "./supabase-fixture";
const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };

cloud(
  "completed setup collapses without hiding the checklist or requiring optional providers",
  async ({ company, page }) => {
    expect(
      (
        await page.request.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const config = await (
      await page.request.get("/api/business-config")
    ).json();
    Object.assign(config.profile, {
      website: "https://example.test",
      email: "office@example.test",
      phone: "9195550100",
    });
    for (const key of ["automations", "agreements", "payments"])
      config.modules[key] = false;
    expect(
      (
        await page.request.put("/api/business-config", {
          headers,
          data: config,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post("/api/business-logo", {
          headers,
          multipart: {
            logo: {
              name: "qa.jpg",
              mimeType: "image/jpeg",
              buffer: await readFile("public/images/kitchen.jpg"),
            },
          },
        })
      ).status(),
    ).toBe(200);
    await page.route("**/api/onboarding/status", (route) =>
      route.fulfill({
        json: {
          organizationId: company.organizationId,
          canCreateBusiness: false,
          connections: Object.fromEntries(
            [
              "google_calendar",
              "openrouter_generation",
              "team_notifications",
              "workflow_secrets",
            ].map((id) => [id, { state: "disabled", detail: "Optional" }]),
          ),
          mail: {
            configured: true,
            connected: true,
            email: "office@example.test",
          },
          googleReviews: {
            configured: false,
            connected: false,
            locationTitle: null,
          },
          phone: { connected: false },
          websiteLeads: { connected: false },
          payments: {
            stripeConnected: false,
            selectedProvider: "manual",
            enabled: false,
          },
        },
      }),
    );
    await page.goto("/?view=Settings#setup");
    await expect(
      page.getByText("Required setup complete", { exact: true }),
    ).toBeVisible();
    const completed = page
      .locator(".onboarding-group")
      .filter({ has: page.locator("summary", { hasText: /^Completed/ }) });
    await expect(completed).not.toHaveAttribute("open", "");
    await expect(
      page.getByRole("heading", { name: "Create business", exact: true }),
    ).not.toBeVisible();
    await completed.locator("summary").click();
    await expect(
      page.getByRole("heading", { name: "Create business", exact: true }),
    ).toBeVisible();
    await page.getByText(/^Optional tools \(/).click();
    const optional = page
      .locator(".onboarding-group")
      .filter({ has: page.locator("summary", { hasText: /^Optional tools/ }) });
    await expect(optional).not.toContainText("Needs setup");
    await expect(
      optional.getByRole("heading", { name: "Google reviews", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Remaining setup", exact: true }),
    ).toHaveCount(0);
    await page.route("**/api/onboarding/test-email", (route) =>
      route.fulfill({ json: { sentTo: "office@example.test" } }),
    );
    await page.getByText("Test connections", { exact: true }).click();
    await page
      .getByRole("button", { name: "Send test email", exact: true })
      .click();
    await expect(
      page.getByText("Test email sent to office@example.test.", {
        exact: true,
      }),
    ).toBeVisible();
  },
);

cloud(
  "a grouped Company section does not grant business editing to a branding-only member",
  async ({ company, page, browser }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const config = await (await api.get("/api/business-config")).json();
    config.rolePermissions.office = ["branding.manage"];
    config.roleNavigation.office = ["Settings"];
    expect(
      (
        await api.put("/api/business-config", { headers, data: config })
      ).status(),
    ).toBe(200);
    const member = await company.admin.auth.admin.createUser({
      email: company.memberEmail,
      password,
      email_confirm: true,
    });
    expect(member.error).toBeNull();
    expect(
      (
        await company.admin.from("profiles").insert({
          organization_id: company.organizationId,
          auth_user_id: member.data.user!.id,
          email: company.memberEmail,
          full_name: "Branding member",
          role: "office",
          active: true,
        })
      ).error,
    ).toBeNull();
    const context = await browser.newContext({
      baseURL: "http://localhost:3100",
    });
    try {
      expect(
        (
          await context.request.post("/api/auth", {
            headers,
            data: { action: "login", email: company.memberEmail, password },
          })
        ).status(),
      ).toBe(200);
      const memberPage = await context.newPage();
      await memberPage.goto("/?view=Settings#company");
      const nav = memberPage.getByRole("navigation", {
        name: "Settings categories",
      });
      await expect(
        nav.getByRole("button", { name: "Company", exact: true }),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("heading", {
          name: "Brand & documents",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        memberPage.getByLabel("Company name", { exact: true }),
      ).toHaveCount(0);
      await expect(
        nav.getByRole("button", { name: "Modules", exact: true }),
      ).toHaveCount(0);
      await expect(
        nav.getByRole("button", { name: "Customer portal", exact: true }),
      ).toHaveCount(0);
      const changed = {
        ...config,
        profile: { ...config.profile, name: "Forbidden company edit" },
      };
      expect(
        (
          await context.request.put("/api/business-config", {
            headers,
            data: changed,
          })
        ).status(),
      ).toBe(403);
    } finally {
      await context.close();
    }
  },
);

cloud(
  "enabled modules stay required and optional tools never look like setup blockers",
  async ({ company, page }) => {
    expect(
      (
        await page.request.post("/api/auth", {
          headers,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);
    const config = await (
      await page.request.get("/api/business-config")
    ).json();
    for (const key of ["automations", "agreements", "payments"])
      config.modules[key] = true;
    expect(
      (
        await page.request.put("/api/business-config", {
          headers,
          data: config,
        })
      ).status(),
    ).toBe(200);
    await page.route("**/api/onboarding/status", (route) =>
      route.fulfill({
        json: {
          organizationId: company.organizationId,
          canCreateBusiness: false,
          connections: {},
          mail: { configured: false, connected: false, email: null },
          googleReviews: {
            configured: false,
            connected: false,
            locationTitle: null,
          },
          phone: { connected: false },
          websiteLeads: { connected: false },
          payments: {
            stripeConnected: false,
            selectedProvider: "stripe",
            enabled: true,
          },
          modules: {
            automations: { enabled: true, configured: false },
            agreements: { enabled: true, configured: false },
            payments: { enabled: true, configured: false },
          },
        },
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=Settings#setup");
    const required = page.getByRole("region", {
      name: "Remaining setup",
      exact: true,
    });
    for (const name of [
      "Company email",
      "Website lead form",
      "Automations",
      "Agreement templates",
      "Payments",
    ])
      await expect(
        required.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    await expect(
      page.getByText(/^[12] of 7 required tasks complete$/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Google reviews", exact: true }),
    ).not.toBeVisible();
    await page.getByText(/^Optional tools \(/).click();
    const optional = page
      .locator(".onboarding-group")
      .filter({ has: page.locator("summary", { hasText: /^Optional tools/ }) });
    await expect(optional).not.toContainText("Needs setup");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Connect reviews", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Google reviews", exact: true }),
    ).toBeVisible();
  },
);
