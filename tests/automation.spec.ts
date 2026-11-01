import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = {
  Origin: `http://localhost:${process.env.PLAYWRIGHT_PORT || 3100}`,
};

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
    page.getByRole("heading", { name: "Find or create contact" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create lead" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Send confirmation text" }),
  ).toBeVisible();
  await expect(page.getByLabel("Lead source")).toHaveValue("Website form");
  await expect(page.getByLabel("Workflow name")).toBeDisabled();

  const workflowCanvas = page.getByLabel(
    "Workflow canvas. Drag to pan. Hold Control and scroll to zoom.",
  );
  const zoomReadout = page.getByLabel("Workflow zoom controls").locator("span");
  const initialZoom = await zoomReadout.textContent();
  const modifiedWheelPrevented = await workflowCanvas.evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(modifiedWheelPrevented).toBe(true);
  await expect(zoomReadout).not.toHaveText(initialZoom || "");

  const zoomAfterShortcut = await zoomReadout.textContent();
  const regularWheelPrevented = await workflowCanvas.evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(regularWheelPrevented).toBe(false);
  await expect(zoomReadout).toHaveText(zoomAfterShortcut || "");

  const connectorOffsets = await page
    .locator(".workflow-tree-next")
    .evaluateAll((items) =>
      items.slice(0, 4).map((item) => {
        const edge = item.querySelector<HTMLElement>(
          ":scope > .workflow-tree-edge",
        );
        const insert = item.querySelector<HTMLElement>(
          ":scope > .workflow-tree-edge > .workflow-insert-step",
        );
        const nextNode = item.querySelector<HTMLElement>(
          ":scope > .workflow-tree-segment > .workflow-tree-node",
        );
        const center = (element: HTMLElement) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left + bounds.width / 2;
        };
        if (!edge || !nextNode) return null;
        const nodeCenter = center(nextNode);
        return {
          connector: Math.abs(center(edge) - nodeCenter),
          insert: insert ? Math.abs(center(insert) - nodeCenter) : null,
        };
      }),
    );
  expect(connectorOffsets.filter(Boolean).length).toBeGreaterThan(0);
  for (const offset of connectorOffsets) {
    if (!offset) continue;
    expect(offset.connector).toBeLessThan(0.25);
    if (offset.insert !== null) expect(offset.insert).toBeLessThan(0.25);
  }

  for (let index = 0; index < 8; index += 1)
    await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(200);
  const canvasBounds = await workflowCanvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  const panStart = await workflowCanvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const interactive =
      "button, a, input, select, textarea, summary, label, [contenteditable='true'], [draggable='true']";
    for (let y = bounds.top + 24; y < bounds.bottom - 24; y += 32) {
      for (let x = bounds.left + 24; x < bounds.right - 24; x += 32) {
        const target = document.elementFromPoint(x, y);
        if (
          target instanceof Element &&
          element.contains(target) &&
          !target.closest(interactive)
        )
          return { x, y };
      }
    }
    throw new Error("Could not find empty workflow canvas space to pan.");
  });
  const panBefore = await workflowCanvas.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
  await page.mouse.move(panStart.x, panStart.y);
  await page.mouse.down();
  await expect(workflowCanvas).toHaveClass(/is-panning/);
  await page.mouse.move(panStart.x - 40, panStart.y - 80, { steps: 4 });
  await page.mouse.up();
  await expect(workflowCanvas).not.toHaveClass(/is-panning/);
  const panAfter = await workflowCanvas.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
  expect(panAfter.left > panBefore.left || panAfter.top > panBefore.top).toBe(
    true,
  );

  await page.getByRole("button", { name: "Test" }).click();
  await expect(page.getByText("TEST INPUT")).toBeVisible();
  await expect(page.getByLabel("Event type")).toHaveValue(
    "website.form.submitted",
  );
  await expect(page.getByLabel("Test fixture source")).toHaveValue("manual");
  await expect(
    page.getByLabel("Test fixture source").locator('option[value="recent"]'),
  ).toHaveAttribute("disabled", "");
  await page.getByRole("button", { name: "Build" }).click();
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
  await expect(
    page.getByRole("button", { name: "Create workflow" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add step/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("workflow webhook management is private and inbound hooks require JSON", async ({
  request,
}) => {
  expect(
    (
      await request.get(`/api/workflows/${crypto.randomUUID()}/webhook-token`)
    ).status(),
  ).toBe(401);
  expect(
    (await request.get("/api/workflows/test-fixtures?mode=recent")).status(),
  ).toBe(401);
  expect((await request.get("/api/workflows/connections")).status()).toBe(401);
  expect(
    (
      await request.post(`/api/workflows/${crypto.randomUUID()}/test-action`, {
        headers: origin,
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(
        `/api/workflows/${crypto.randomUUID()}/runs/${crypto.randomUUID()}/retry`,
        { headers: origin },
      )
    ).status(),
  ).toBe(401);
  const inbound = await request.post(
    `/api/workflows/inbound/${"a".repeat(43)}`,
    {
      headers: { "Content-Type": "text/plain" },
      data: "not json",
    },
  );
  expect(inbound.status()).toBe(415);
});

test("workflow object links can open the affected Contact and Lead", async ({
  page,
}) => {
  await page.goto(
    "/demo?view=Contacts&record=00000000-0000-4000-8000-000000000101",
  );
  await expect(page.getByRole("dialog", { name: "Taylor Reed" })).toBeVisible();

  await page.goto(
    "/demo?view=Leads&record=00000000-0000-4000-8000-000000000102",
  );
  await expect(page.getByLabel("Taylor Reed lead")).toBeVisible();
});

cloudTest(
  "an administrator can author, test, publish, inspect, and restore a composable workflow",
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

    await page.goto("/?view=Automation");
    await page.getByRole("button", { name: "Create workflow" }).click();
    const createDialog = page.locator(".workflow-create-dialog");
    await createDialog
      .getByLabel("Name", { exact: true })
      .fill("Composable QA workflow");
    await createDialog.getByLabel("Starting point").selectOption("blank");
    await createDialog.getByLabel("Primary object").selectOption("contact");
    await createDialog.getByRole("button", { name: "Create workflow" }).click();

    const tree = page.getByLabel("Workflow decision tree");
    const inspector = page.getByLabel("Workflow inspector");
    const manualTrigger = tree.getByRole("button", {
      name: /^TRIGGER Manual enrollment/,
    });
    await expect(manualTrigger).toBeVisible();
    await manualTrigger.click();
    await inspector
      .locator(".workflow-trigger-filter")
      .getByRole("button", { name: "Add" })
      .click();
    await expect(inspector.getByLabel("Condition value")).toBeVisible();

    await tree
      .getByRole("button", { name: "Add step after Manual enrollment" })
      .click();
    await page
      .getByRole("dialog", { name: "Add workflow step" })
      .getByRole("button", { name: /Wait/ })
      .click();
    await tree.getByRole("button", { name: "Add step after Wait" }).click();
    await page
      .getByRole("dialog", { name: "Add workflow step" })
      .getByRole("button", { name: /Add note/ })
      .click();
    await inspector
      .getByLabel("Note")
      .fill("Started the workflow for {{contact.firstName}}.");
    const moveEarlier = inspector.getByRole("button", { name: "Move earlier" });
    await moveEarlier.focus();
    await page.keyboard.press("Enter");
    await expect(tree.locator(".workflow-tree-node h2").nth(1)).toHaveText(
      "Add note",
    );

    await tree
      .getByRole("button", { name: "Add step after Manual enrollment" })
      .click();
    await page
      .getByRole("dialog", { name: "Add workflow step" })
      .getByRole("button", { name: /If \/ Else/ })
      .click();
    await inspector
      .locator(".workflow-branch-editor")
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(tree.getByText("Branch 1", { exact: true })).toBeVisible();

    await tree.getByRole("button", { name: "Add step to Otherwise" }).click();
    await page
      .getByRole("dialog", { name: "Add workflow step" })
      .getByRole("button", { name: /^Router/ })
      .click();
    const branchEditor = inspector.locator(".workflow-branch-editor");
    await branchEditor
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await branchEditor
      .getByRole("button", { name: "Add", exact: true })
      .click();
    const branchRows = branchEditor.locator(".workflow-branch-editor-row");
    await expect(branchRows).toHaveCount(3);
    await branchRows.nth(0).dragTo(branchRows.nth(1));
    await expect(branchRows.nth(0).locator("input").first()).toHaveValue(
      "Branch 2",
    );

    await page.getByRole("button", { name: "Test" }).click();
    await page.getByRole("button", { name: "Run dry test" }).click();
    await expect(page.locator(".workflow-trace-step").first()).toBeVisible();
    await expect(
      page.getByText("No messages or records will be sent"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Build" }).click();
    await inspector.getByRole("button", { name: "Workflow settings" }).click();
    await inspector.getByLabel("Folder").fill("QA workflows");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Version \d+ published/)).toBeVisible();

    const workflows = await (await api.get("/api/workflows")).json();
    const summary = workflows.workflows.find(
      (workflow: { name: string }) =>
        workflow.name === "Composable QA workflow",
    );
    expect(summary).toBeTruthy();
    const workflow = await (
      await api.get(`/api/workflows/${summary.id}`)
    ).json();
    const runId = crypto.randomUUID();
    const objectId = crypto.randomUUID();
    const run = await company.admin.from("remodel_workflow_runs").insert({
      id: runId,
      organization_id: company.organizationId,
      workflow_id: workflow.id,
      version_id: workflow.publishedVersionId,
      object_type: "contact",
      object_id: objectId,
      correlation_id: crypto.randomUUID(),
      status: "completed",
      summary: { subject: "Composable QA run" },
      completed_at: new Date().toISOString(),
    });
    expect(run.error).toBeNull();
    const step = await company.admin.from("remodel_workflow_step_runs").insert({
      organization_id: company.organizationId,
      run_id: runId,
      node_id: "manual",
      node_type: "trigger.manual",
      attempt: 1,
      status: "completed",
      input_snapshot: { eventType: "workflow.manual" },
      output_snapshot: { matched: true },
      idempotency_key: `qa:${runId}:manual`,
      completed_at: new Date().toISOString(),
    });
    expect(step.error).toBeNull();

    await page.getByRole("button", { name: "Runs" }).click();
    const runRow = page.locator(".workflow-run-row").filter({
      hasText: "Composable QA run",
    });
    await expect(runRow).toBeVisible();
    await runRow.locator("summary").first().click();
    await runRow.getByText("Safe input and output", { exact: true }).click();
    await expect(runRow.getByText("workflow.manual")).toBeVisible();

    await page.getByRole("button", { name: "Versions" }).click();
    await expect(
      page.getByText("Published", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Restore as draft" })
      .first()
      .click();
    await expect(
      page.getByText("Version restored as a new draft"),
    ).toBeVisible();
    const restored = await (
      await api.get(`/api/workflows/${summary.id}`)
    ).json();
    expect(restored.draftVersionId).not.toBe(restored.publishedVersionId);
  },
);

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
    await expect(
      page.getByRole("button", { name: /Website lead intake/ }),
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
          { key: "email", label: "Confirmation email", status: "failed" },
          { key: "team", label: "Team notification", status: "unknown" },
        ],
      })
      .select("id")
      .single();
    expect(retryRun.error).toBeNull();
    const retryId = retryRun.data!.id;
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
          { key: "email", label: "Confirmation email", status: "pending" },
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
