import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

test("automation workspace visualizes the website lead workflow", async ({
  page,
}) => {
  await page.goto("/demo?view=Automation");
  await expect(
    page.getByRole("heading", { name: "Automation." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Website form submitted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find or create customer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create lead" }),
  ).toBeVisible();
  await expect(page.getByLabel("Lead source")).toHaveValue("Website form");
  await expect(page.getByLabel("Workflow name")).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

cloudTest(
  "website lead automation controls contact matching and lead defaults",
  async ({ company, page, request }) => {
    const api = page.request;
    expect(
      (
        await api.post("/api/auth", {
          headers: origin,
          data: { action: "login", email: company.email, password },
        })
      ).status(),
    ).toBe(200);

    const current = await (
      await api.get("/api/automations/website-leads")
    ).json();
    const updated = {
      ...current,
      sourceLabel: "Landing page",
      initialStage: "Follow-up",
      initialDisposition: "Future",
      matchExistingContacts: true,
      sendAcknowledgement: false,
      sendTeamNotification: false,
    };
    expect(
      (
        await api.put("/api/automations/website-leads", {
          headers: origin,
          data: updated,
        })
      ).status(),
    ).toBe(200);

    const lead = {
      first_name: "Automation",
      last_name: "Customer",
      email: `automation-${Date.now()}@example.com`,
      phone: "+19195550167",
      project: "Bathroom Remodel",
    };
    for (const project of ["Bathroom Remodel", "Kitchen Remodel"])
      expect(
        (
          await request.post("/api/leads", {
            headers: { Origin: "https://www.premiumremodel.com" },
            data: { ...lead, project },
          })
        ).status(),
      ).toBe(201);

    const workspace = await (await api.get("/api/workspace")).json();
    expect(workspace.contacts).toHaveLength(1);
    expect(workspace.leads).toHaveLength(2);
    expect(workspace.leads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "Landing page",
          status: "Follow-up",
          disposition: "Future",
          contactId: workspace.contacts[0].id,
          emailAcknowledgement: expect.objectContaining({ status: "skipped" }),
          discordNotification: expect.objectContaining({ status: "skipped" }),
        }),
      ]),
    );
  },
);
