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
  await expect(
    page.getByRole("heading", { name: "Send confirmation text" }),
  ).toBeVisible();
  await expect(page.getByLabel("Lead source")).toHaveValue("Website form");
  await expect(page.getByLabel("Workflow name")).toBeDisabled();
  await page.getByRole("button", { name: /Inbound text compliance/ }).click();
  await expect(
    page.getByRole("heading", { name: "Customer sends a text" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Send help information" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add to Do Not Disturb" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Customer restores permission" }),
  ).toBeVisible();
  await expect(
    page.getByText("A new lead form cannot override it."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check the website consent category" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

cloudTest(
  "workflow settings keep history and reject stale edits",
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

    const url = "/api/automations/website-leads";
    const historyUrl = `${url}/revisions`;
    const initial = await (await api.get(url)).json();
    expect(initial.revision).toBe(0);
    expect((await (await api.get(historyUrl)).json()).revisions).toEqual([]);

    const firstResponse = await api.put(url, {
      headers: origin,
      data: { ...initial, sourceLabel: "Website version one" },
    });
    expect(firstResponse.status()).toBe(200);
    const first = await firstResponse.json();
    expect(first.revision).toBe(1);

    const competing = await Promise.all([
      api.put(url, {
        headers: origin,
        data: { ...first, sourceLabel: "Website version two" },
      }),
      api.put(url, {
        headers: origin,
        data: { ...first, sourceLabel: "Overwritten from old tab" },
      }),
    ]);
    expect(competing.map((response) => response.status()).sort()).toEqual([
      200, 409,
    ]);
    const current = await (await api.get(url)).json();
    expect(current.revision).toBe(2);
    expect(current.sourceLabel).not.toBe("Website version one");

    const unchangedResponse = await api.put(url, {
      headers: origin,
      data: current,
    });
    expect(unchangedResponse.status()).toBe(200);
    expect((await unchangedResponse.json()).revision).toBe(2);

    const savedHistory = (await (await api.get(historyUrl)).json()).revisions;
    expect(savedHistory).toHaveLength(2);
    expect(
      savedHistory.map((item: { revision: number }) => item.revision),
    ).toEqual([2, 1]);
    expect(savedHistory[1].definition.sourceLabel).toBe("Website version one");
    expect(savedHistory[1].actorName).toBe("Workspace Owner");

    const restoreResponse = await api.put(url, {
      headers: origin,
      data: { ...savedHistory[1].definition, revision: current.revision },
    });
    expect(restoreResponse.status()).toBe(200);
    expect(await restoreResponse.json()).toEqual(
      expect.objectContaining({
        revision: 3,
        sourceLabel: "Website version one",
      }),
    );
    const restoredHistory = (await (await api.get(historyUrl)).json())
      .revisions;
    expect(
      restoredHistory.map((item: { revision: number }) => item.revision),
    ).toEqual([3, 2, 1]);
    await page.goto("/?view=Automation");
    await expect(
      page.getByRole("heading", { name: "Automation." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "History" }).click();
    const historyPanel = page.getByRole("region", { name: "Workflow history" });
    await expect(historyPanel.getByText("Version 3")).toBeVisible();
    await expect(
      historyPanel.getByText("Workspace Owner", { exact: false }).first(),
    ).toBeVisible();
  },
);

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
      sendSmsAcknowledgement: false,
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
            headers: {
              Origin: "https://www.premiumremodel.com",
              "x-forwarded-for": `playwright-automation-${lead.email}`,
            },
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
          smsAcknowledgement: expect.objectContaining({ status: "skipped" }),
          discordNotification: expect.objectContaining({ status: "skipped" }),
        }),
      ]),
    );

    const historyResponse = await api.get(
      "/api/automations/website-leads/runs",
    );
    expect(historyResponse.status()).toBe(200);
    const history = await historyResponse.json();
    expect(history.recentCount).toBe(2);
    expect(history.attentionCount).toBe(0);
    expect(history.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "completed",
          steps: expect.arrayContaining([
            expect.objectContaining({ key: "contact", status: "created" }),
            expect.objectContaining({ key: "lead", status: "created" }),
            expect.objectContaining({ key: "email", status: "skipped" }),
            expect.objectContaining({ key: "sms", status: "skipped" }),
            expect.objectContaining({ key: "team", status: "skipped" }),
          ]),
        }),
        expect.objectContaining({
          status: "completed",
          steps: expect.arrayContaining([
            expect.objectContaining({ key: "contact", status: "reused" }),
          ]),
        }),
      ]),
    );

    const retryRun = await company.admin
      .from("remodel_automation_runs")
      .insert({
        organization_id: company.organizationId,
        automation_key: "website-lead-intake",
        lead_id: workspace.leads[1].id,
        subject: workspace.leads[1].name,
        project: workspace.leads[1].project,
        status: "needs_attention",
        steps: [
          { key: "lead", label: "Lead", status: "created" },
          { key: "email", label: "Customer confirmation", status: "failed" },
          { key: "team", label: "Team notification", status: "unknown" },
        ],
      })
      .select("id")
      .single();
    expect(retryRun.error).toBeNull();
    const retryId = retryRun.data!.id;
    await page.goto("/?view=Automation");
    await expect(page.getByText("1 need attention")).toBeVisible();
    const failedRun = page.locator(".automation-run").filter({
      has: page.locator(".automation-run-status.is-needs_attention"),
    });
    await expect(failedRun).toHaveCount(1);
    await failedRun
      .getByRole("button", { name: /Automation Customer/ })
      .click();
    await expect(failedRun.getByText("Needs attention")).toBeVisible();
    await expect(failedRun.getByText("Customer confirmation")).toBeVisible();
    await expect(failedRun.getByText("failed", { exact: true })).toBeVisible();
    await expect(
      failedRun.getByRole("button", { name: "Retry action" }),
    ).toBeVisible();
    const retryUrl = `/api/automations/website-leads/runs/${retryId}/retry`;
    const retryResponse = await api.post(retryUrl, {
      headers: origin,
      data: { step: "email" },
    });
    expect(retryResponse.status()).toBe(200);
    expect((await retryResponse.json()).status).toBe("not_configured");
    const afterRetry = await (
      await api.get("/api/automations/website-leads/runs")
    ).json();
    expect(
      afterRetry.runs.find((run: { id: string }) => run.id === retryId),
    ).toEqual(
      expect.objectContaining({
        status: "needs_attention",
        steps: expect.arrayContaining([
          expect.objectContaining({
            key: "email",
            status: "not_configured",
            attempts: 2,
          }),
        ]),
      }),
    );
    expect(
      (
        await api.post(retryUrl, {
          headers: origin,
          data: { step: "team" },
        })
      ).status(),
    ).toBe(409);
    const retryWorkspace = await (await api.get("/api/workspace")).json();
    expect(
      retryWorkspace.leads.find(
        (item: { id: string }) => item.id === workspace.leads[1].id,
      ).emailAcknowledgement.status,
    ).toBe("not_configured");
    expect(retryWorkspace.leads).toHaveLength(2);
    expect(retryWorkspace.contacts).toHaveLength(1);

    const claims = await Promise.all([
      company.admin.rpc("remodel_claim_automation_retry", {
        p_organization_id: company.organizationId,
        p_run_id: retryId,
        p_step_key: "email",
      }),
      company.admin.rpc("remodel_claim_automation_retry", {
        p_organization_id: company.organizationId,
        p_run_id: retryId,
        p_step_key: "email",
      }),
    ]);
    expect(claims.map((claim) => claim.error)).toEqual([null, null]);
    expect(claims.map((claim) => claim.data).sort()).toEqual([false, true]);
    const release = await company.admin.rpc("remodel_finish_automation_retry", {
      p_organization_id: company.organizationId,
      p_run_id: retryId,
      p_step_key: "email",
      p_result: {
        status: "not_configured",
        attemptedAt: new Date().toISOString(),
      },
    });
    expect(release.error).toBeNull();
    expect(release.data).toBe(true);

    const staleRun = await company.admin
      .from("remodel_automation_runs")
      .insert({
        organization_id: company.organizationId,
        automation_key: "website-lead-intake",
        lead_id: workspace.leads[1].id,
        subject: workspace.leads[1].name,
        project: workspace.leads[1].project,
        status: "running",
        started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        last_activity_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        steps: [
          { key: "lead", label: "Lead", status: "created" },
          { key: "email", label: "Customer confirmation", status: "pending" },
          { key: "team", label: "Team notification", status: "retrying" },
        ],
      })
      .select("id")
      .single();
    expect(staleRun.error).toBeNull();
    const reconciled = await (
      await api.get("/api/automations/website-leads/runs")
    ).json();
    expect(
      reconciled.runs.find(
        (run: { id: string }) => run.id === staleRun.data!.id,
      ),
    ).toEqual(
      expect.objectContaining({
        status: "needs_attention",
        steps: expect.arrayContaining([
          expect.objectContaining({ key: "email", status: "unknown" }),
          expect.objectContaining({ key: "team", status: "unknown" }),
          expect.objectContaining({ key: "record", status: "unknown" }),
        ]),
      }),
    );
    expect(
      (
        await api.post(
          `/api/automations/website-leads/runs/${staleRun.data!.id}/retry`,
          { headers: origin, data: { step: "email" } },
        )
      ).status(),
    ).toBe(409);

    const removedLeadId = workspace.leads[0].id;
    const removed = await company.admin
      .from("remodel_records")
      .delete()
      .eq("organization_id", company.organizationId)
      .eq("kind", "lead")
      .eq("id", removedLeadId);
    expect(removed.error).toBeNull();
    const retainedHistory = await (
      await api.get("/api/automations/website-leads/runs")
    ).json();
    expect(
      retainedHistory.runs.some(
        (run: { leadId: string }) => run.leadId === removedLeadId,
      ),
    ).toBe(true);
  },
);
