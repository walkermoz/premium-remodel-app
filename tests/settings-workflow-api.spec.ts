import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { test, expect, password } from "./supabase-fixture";
import {
  defaultOperatingSettings,
  type OperatingSettings,
} from "@/lib/operating-settings";
import { workflowTemplateDefinition } from "@/lib/workflows/templates";
import type {
  WorkflowDefinition,
  WorkflowObjectType,
  WorkflowEvent,
} from "@/lib/workflows/schema";

const cloud = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const headers = { Origin: "http://localhost:3100" };
async function login(api: APIRequestContext, email: string) {
  expect(
    (
      await api.post("/api/auth", {
        headers,
        data: { action: "login", email, password },
      })
    ).status(),
  ).toBe(200);
}
async function save<K extends keyof OperatingSettings>(
  api: APIRequestContext,
  section: K,
  value: OperatingSettings[K],
) {
  const current = await (await api.get("/api/operating-settings")).json();
  const response = await api.patch("/api/operating-settings", {
    headers,
    data: { section, value, revision: current.revision },
  });
  expect(await response.json()).not.toHaveProperty("error");
  expect(response.status()).toBe(200);
}
async function workflow(
  api: APIRequestContext,
  primaryObjectType: WorkflowObjectType,
  type: string,
  config: Record<string, unknown>,
  publish = true,
) {
  const created = await api.post("/api/workflows", {
    headers,
    data: { name: "Settings regression", primaryObjectType, template: "blank" },
  });
  expect(created.status()).toBe(201);
  const initial = await created.json();
  const definition: WorkflowDefinition = workflowTemplateDefinition(
    "blank",
    primaryObjectType,
  );
  definition.graph.nodes[0].outgoing[0].to = "settings-action";
  definition.graph.nodes.splice(1, 0, {
    id: "settings-action",
    type,
    kind: "action",
    name: "Apply settings",
    config,
    outgoing: [
      {
        id: "action-end",
        to: "end",
        label: "Continue",
        order: 0,
        kind: "default",
      },
    ],
  });
  const response = await api.put(`/api/workflows/${initial.id}`, {
    headers,
    data: { revision: initial.revision, definition },
  });
  const saved = await response.json();
  expect(saved).not.toHaveProperty("error");
  expect(response.status()).toBe(200);
  if (publish) {
    const result = await api.post(`/api/workflows/${saved.id}/publish`, {
      headers,
      data: { revision: saved.revision },
    });
    expect(await result.json()).not.toHaveProperty("error");
    expect(result.status()).toBe(200);
  }
  return saved.id as string;
}
async function execute(
  api: APIRequestContext,
  admin: SupabaseClient,
  org: string,
  workflowId: string,
  objectType: WorkflowObjectType,
  objectId: string,
) {
  const id = randomUUID();
  const event = await admin.from("remodel_workflow_events").insert({
    id,
    organization_id: org,
    schema_version: 1,
    event_type: "workflow.manual",
    actor: { type: "system" },
    object_type: objectType,
    object_id: objectId,
    occurred_at: new Date().toISOString(),
    correlation_id: randomUUID(),
    idempotency_key: id,
    payload: { targetWorkflowId: workflowId },
  });
  expect(event.error).toBeNull();
  expect(
    (
      await admin
        .from("remodel_automation_outbox")
        .insert({ organization_id: org, event_id: id, status: "pending" })
    ).error,
  ).toBeNull();
  await expect
    .poll(
      async () => {
        const response = await api.post("/api/workflows/worker", {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET || "playwright-workflow-secret"}`,
          },
        });
        expect(response.status()).toBe(200);
        const result = await admin
          .from("remodel_workflow_runs")
          .select("status")
          .eq("organization_id", org)
          .eq("event_id", id)
          .eq("workflow_id", workflowId)
          .maybeSingle();
        expect(result.error).toBeNull();
        return result.data?.status;
      },
      { timeout: 60_000 },
    )
    .not.toBeUndefined();
  const run = await admin
    .from("remodel_workflow_runs")
    .select("status")
    .eq("organization_id", org)
    .eq("event_id", id)
    .eq("workflow_id", workflowId)
    .single();
  if (run.data!.status === "waiting") {
    const step = await admin
      .from("remodel_workflow_step_runs")
      .select("error_code,error_detail")
      .eq("organization_id", org)
      .eq("node_id", "settings-action")
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throw new Error(
      `Local workflow entered retry: ${step.data?.error_code || "unknown"}: ${step.data?.error_detail || "No detail"}`,
    );
  }
  return run.data!.status;
}
const literal = (value: string) => ({ kind: "literal", value });
const access = {
  id: "access",
  label: "Access",
  type: "text" as const,
  required: true,
  defaultValue: null,
  options: [],
  targets: ["contact", "quote", "project"] as (
    "contact" | "quote" | "project"
  )[],
  transfer: true,
  clientVisible: true,
  archived: false,
};

cloud(
  "published handoff preserves quoted terms, transfers fields, assigns forms and cannot bypass closeout",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    await save(api, "customFields", [access]);
    await save(api, "forms", [
      {
        id: "closeout",
        title: "Closeout",
        required: true,
        autoAssign: true,
        archived: false,
        fields: [
          {
            id: "checked",
            label: "Inspection passed",
            type: "boolean",
            required: true,
            options: [],
            defaultValue: null,
          },
        ],
      },
    ]);
    const quoted = {
      ...defaultOperatingSettings().invoices,
      depositPercent: 30,
    };
    await save(api, "invoices", quoted);
    const response = await api.post("/api/workspace", {
      headers,
      data: {
        kind: "quote",
        data: {
          name: "Frozen quote",
          address: "100 Test Lane",
          client: "QA",
          clientEmail: "qa@example.test",
          clientPhone: "",
          status: "Draft",
          startDate: "",
          endDate: "",
          completedDate: "",
          description: "",
          category: "Kitchen",
          cover: "",
          customValues: { access: "Side gate" },
        },
      },
    });
    const quote = await response.json();
    expect(response.status()).toBe(201);
    await save(api, "invoices", { ...quoted, depositPercent: 70 });
    const id = await workflow(api, "quote", "action.createProjectFromQuote", {
      quoteId: literal(quote.id),
      fields: {},
    });
    expect(
      await execute(
        api,
        company.admin,
        company.organizationId,
        id,
        "quote",
        quote.id,
      ),
    ).toBe("completed");
    const result = await company.admin
      .from("remodel_records")
      .select("id,data")
      .eq("organization_id", company.organizationId)
      .eq("kind", "project")
      .eq("data->>quoteId", quote.id)
      .single();
    expect(result.error).toBeNull();
    expect(result.data!.data).toMatchObject({
      customValues: { access: "Side gate" },
      invoiceDefaults: quoted,
    });
    expect(result.data!.data.recordForms).toHaveLength(1);
    const close = await workflow(api, "project", "action.updateObject", {
      objectType: "project",
      objectId: literal(result.data!.id),
      fields: { status: literal("Completed") },
    });
    expect(
      await execute(
        api,
        company.admin,
        company.organizationId,
        close,
        "project",
        result.data!.id,
      ),
    ).toBe("needs_attention");
    const unchanged = await company.admin
      .from("remodel_records")
      .select("data")
      .eq("id", result.data!.id)
      .single();
    expect(unchanged.data!.data.status).toBe("Planning");
    expect(unchanged.data!.data.invoiceDefaults).toEqual(quoted);
  },
);

cloud(
  "published scheduling actions operate at all hours regardless of displayed business hours",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    const hours = defaultOperatingSettings().hours;
    await save(api, "hours", {
      ...hours,
      enabled: true,
      blockOutside: true,
      days: hours.days.map((day) => ({
        ...day,
        open: true,
        start: "08:00",
        end: "17:00",
      })),
    });
    const projectResponse = await api.post("/api/workspace", {
      headers,
      data: {
        kind: "project",
        data: {
          name: "After hours project",
          address: "100 Test Lane",
          client: "QA",
          clientEmail: "qa@example.test",
          clientPhone: "",
          status: "Planning",
          startDate: "",
          endDate: "",
          completedDate: "",
          description: "",
          category: "Kitchen",
          cover: "",
        },
      },
    });
    expect(projectResponse.status()).toBe(201);
    const project = await projectResponse.json();
    const id = await workflow(api, "project", "action.createItem", {
      fields: {
        projectId: literal(project.id),
        status: literal("To do"),
        workType: literal("Task"),
        priority: literal("Medium"),
        contractorId: literal(""),
        description: literal("Local verification"),
        title: literal("After hours work"),
        dueDate: literal("2030-11-26"),
        startTime: literal("23:00"),
        endTime: literal("23:30"),
      },
    });
    expect(
      await execute(
        api,
        company.admin,
        company.organizationId,
        id,
        "project",
        project.id,
      ),
    ).toBe("completed");
    const records = await company.admin
      .from("remodel_records")
      .select("id")
      .eq("organization_id", company.organizationId)
      .eq("kind", "task")
      .eq("data->>title", "After hours work");
    expect(records.data).toHaveLength(1);
  },
);

cloud(
  "manual intake and automated contact capture apply defaults without discarding incomplete leads",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    await save(api, "customFields", [
      access,
      {
        ...access,
        id: "origin",
        label: "Origin",
        required: false,
        defaultValue: "Company default",
      },
    ]);
    const response = await api.post("/api/leads/manual", {
      headers,
      data: { name: "QA Intake", email: "qa@example.test", project: "Kitchen" },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).contact.customValues).toEqual({
      origin: "Company default",
      access: null,
    });
    const automation = await (
      await api.get("/api/automations/website-leads")
    ).json();
    expect(
      (
        await api.put("/api/automations/website-leads", {
          headers,
          data: {
            ...automation,
            sendAcknowledgement: false,
            sendSmsAcknowledgement: false,
            sendTeamNotification: false,
          },
        })
      ).status(),
    ).toBe(200);
    const captured = await api.post("/api/leads", {
      headers: {
        Origin: "https://www.premiumremodel.com",
        "x-forwarded-for": `local-settings-${randomUUID()}`,
      },
      data: {
        first_name: "Website",
        last_name: "QA",
        email: "public-capture@example.test",
        phone: "+19195550100",
        project: "Kitchen Remodel",
      },
    });
    expect(captured.status()).toBe(201);
    await expect
      .poll(async () => {
        const row = await company.admin
          .from("remodel_records")
          .select("data")
          .eq("organization_id", company.organizationId)
          .eq("kind", "contact")
          .eq("data->>email", "public-capture@example.test")
          .maybeSingle();
        return row.data?.data.customValues;
      })
      .toEqual({ origin: "Company default", access: null });
    const id = await workflow(api, "lead", "action.createContact", {
      fields: {
        firstName: literal("QA Workflow"),
        email: literal("workflow@example.test"),
      },
    });
    expect(
      await execute(
        api,
        company.admin,
        company.organizationId,
        id,
        "lead",
        randomUUID(),
      ),
    ).toBe("completed");
    const record = await company.admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", company.organizationId)
      .eq("kind", "contact")
      .eq("data->>email", "workflow@example.test")
      .single();
    expect(record.error).toBeNull();
    expect(record.data!.data.customValues).toEqual({
      origin: "Company default",
      access: null,
    });
  },
);

cloud(
  "server workflow preview uses the latest company message template without sending email",
  async ({ company, page }) => {
    const api = page.request;
    await login(api, company.email);
    const id = await workflow(
      api,
      "lead",
      "action.sendEmail",
      {
        messageTemplate: "leadAcknowledgement",
        recipient: literal("qa@example.test"),
      },
      false,
    );
    const messages = {
      ...defaultOperatingSettings().messages,
      leadSubject: "Custom company subject",
      leadBody: "Hi {{firstName}}, custom saved response.",
    };
    await save(api, "messages", messages);
    const event: WorkflowEvent = {
      id: randomUUID(),
      schemaVersion: 1,
      type: "workflow.manual",
      organizationId: company.organizationId,
      actor: { type: "system" },
      objectType: "lead",
      objectId: randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID(),
      idempotencyKey: randomUUID(),
      payload: { firstName: "Jordan" },
    };
    const response = await api.post(`/api/workflows/${id}/test`, {
      headers,
      data: { event },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(
      result.steps.find(
        (step: { nodeId: string }) => step.nodeId === "settings-action",
      ).preview,
    ).toMatchObject({
      subject: messages.leadSubject,
      body: "Hi Jordan, custom saved response.",
    });
    await page.goto("/?view=Automation");
    await page
      .locator(".workflow-list-item")
      .filter({ hasText: "Settings regression" })
      .click();
    await page
      .getByLabel("Workflow decision tree")
      .getByRole("button", { name: /^ACTION Apply settings/ })
      .click();
    const inspector = page.getByLabel("Workflow inspector");
    await expect(inspector.getByLabel("Message source")).toHaveValue(
      "leadAcknowledgement",
    );
    await expect(inspector.getByLabel("Subject", { exact: true })).toHaveValue(
      messages.leadSubject,
    );
    await expect(
      inspector.getByRole("textbox", { name: "Email body", exact: true }),
    ).toBeDisabled();
    await expect(inspector.getByLabel("If a value is missing")).toHaveCount(0);
    await inspector.getByLabel("Message source").selectOption("custom");
    await inspector
      .getByLabel("Subject", { exact: true })
      .fill("Workflow subject");
    await inspector
      .getByRole("textbox", { name: "Email body", exact: true })
      .fill("Workflow body");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
    const custom = await api.post(`/api/workflows/${id}/test`, {
      headers,
      data: { event },
    });
    expect(
      (await custom.json()).steps.find(
        (step: { nodeId: string }) => step.nodeId === "settings-action",
      ).preview,
    ).toMatchObject({ subject: "Workflow subject", body: "Workflow body" });
  },
);
