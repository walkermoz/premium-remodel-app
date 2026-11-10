import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  evaluateWorkflowCondition,
  interpolateWorkflowJson,
  interpolateWorkflowText,
  isSafeWorkflowRegex,
} from "../lib/workflows/conditions";
import {
  smsComplianceWorkflowSeed,
  websiteLeadWorkflowSeed,
} from "../lib/workflows/seeds";
import { simulateWorkflow } from "../lib/workflows/simulator";
import {
  workflowEventSchema,
  type WorkflowDefinition,
  type WorkflowEvent,
} from "../lib/workflows/schema";
import { workflowCanPublish } from "../lib/workflows/validate";
import {
  workflowNodeDefinition,
  workflowNodeDefinitions,
} from "../lib/workflows/registry";
import {
  isPublicWorkflowWebhookUrl,
  isSensitiveWorkflowHeader,
} from "../lib/workflows/webhook-safety";
import {
  runWorkflowRuntime,
  WorkflowConfigurationError,
  WorkflowNodeExecutionError,
  type WorkflowRuntimeExecutor,
} from "../lib/workflows/runtime";
import { workflowRecordEvents } from "../lib/workflows/domain-event-map";
import { workflowTemplateDefinition } from "../lib/workflows/templates";
import { redactWorkflowValue } from "../lib/workflows/redaction";

function event(
  type: WorkflowEvent["type"],
  payload: Record<string, unknown> = {},
): WorkflowEvent {
  return {
    id: randomUUID(),
    schemaVersion: 1,
    type,
    organizationId: randomUUID(),
    actor: { type: "system" },
    objectType: type === "sms.inbound.received" ? "communication" : "lead",
    objectId: randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload,
  };
}

test("workflow events accept PostgreSQL timestamptz offsets", () => {
  expect(
    workflowEventSchema.safeParse({
      ...event("workflow.manual"),
      occurredAt: "2026-10-31T22:48:40.123+00:00",
    }).success,
  ).toBe(true);
});

test("configuration failures are explicitly non-retryable and preserve a stable error code", async () => {
  let failure: WorkflowNodeExecutionError | undefined;
  try {
    await runWorkflowRuntime({
      definition: websiteLeadWorkflowSeed(),
      event: event("website.form.submitted", {
        firstName: "Taylor",
        lastName: "Reed",
        name: "Taylor Reed",
        email: "taylor@example.com",
        phone: "",
        project: "Kitchen Remodel",
        description: "New cabinets",
        smsAppointmentOptIn: false,
      }),
      execute: async ({ node }) => {
        if (node.id === "confirmation-email")
          throw new WorkflowConfigurationError(
            "Connect the company mailbox before this action can run.",
          );
        return { status: "completed" as const };
      },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowNodeExecutionError);
    failure = error as WorkflowNodeExecutionError;
  }
  expect(failure?.errorCode).toBe("CONFIGURATION_REQUIRED");
  expect(failure?.retryable).toBe(false);
  expect(failure?.node.id).toBe("confirmation-email");
});

test("seeded production workflows are valid registered graphs", () => {
  const website = workflowCanPublish(websiteLeadWorkflowSeed());
  const compliance = workflowCanPublish(smsComplianceWorkflowSeed());
  expect(website.valid, JSON.stringify(website.issues, null, 2)).toBe(true);
  expect(compliance.valid, JSON.stringify(compliance.issues, null, 2)).toBe(
    true,
  );
  expect(website.definition?.graph.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "action.findOrCreateContact" }),
      expect.objectContaining({ type: "action.createLead" }),
      expect.objectContaining({ type: "system.smsPolicyGate" }),
      expect.objectContaining({ type: "logic.router" }),
      expect.objectContaining({
        id: "team-notification",
        type: "action.webhook",
        name: "Send lead to Discord",
        config: expect.objectContaining({
          destination: "discord_lead_webhook",
          method: "POST",
          bodyType: "json",
        }),
      }),
    ]),
  );
  expect(JSON.stringify(website.definition)).not.toContain("templateKey");
  expect(
    website.definition?.graph.nodes.find(
      (node) => node.id === "confirmation-email",
    )?.config,
  ).toMatchObject({
    presentation: "business",
    resultTracking: { field: "emailAcknowledgement" },
  });
});

test("Premium website leads fan out to a configurable SMS action", () => {
  const recipients = [
    { name: "Matt", phone: "+19194139782" },
    { name: "Walker", phone: "+19194344860" },
  ];
  const workflow = websiteLeadWorkflowSeed({
    smsRecipients: recipients,
  });
  const validation = workflowCanPublish(workflow);
  expect(validation.valid, JSON.stringify(validation.issues, null, 2)).toBe(
    true,
  );
  expect(
    workflow.graph.nodes.find((node) => node.id === "delivery-router")
      ?.outgoing,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        to: "lead-alert-sms",
        label: "Send SMS",
        kind: "always",
      }),
    ]),
  );
  expect(
    workflow.graph.nodes.find((node) => node.id === "lead-alert-sms"),
  ).toEqual(
    expect.objectContaining({
      type: "action.sendDirectSms",
      config: expect.objectContaining({
        recipients: [
          { name: "Matt", phone: "+19194139782" },
          { name: "Walker", phone: "+19194344860" },
        ],
      }),
    }),
  );
  expect(
    simulateWorkflow(
      workflow,
      event("website.form.submitted", {
        name: "Taylor Reed",
        email: "taylor@example.com",
        phone: "+19195550123",
        project: "Kitchen Remodel",
      }),
    ).steps,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: "lead-alert-sms",
        status: "planned",
        preview: expect.objectContaining({
          recipients,
        }),
      }),
    ]),
  );
});

test("published workflow events always execute without a hidden shadow rollout", () => {
  const runtimeSources = [
    readFileSync("lib/workflows/events.ts", "utf8"),
    readFileSync("lib/workflows/engine.ts", "utf8"),
    readFileSync("app/api/leads/route.ts", "utf8"),
    readFileSync("app/api/twilio/inbound/route.ts", "utf8"),
  ].join("\n");
  expect(runtimeSources).not.toContain("WORKFLOW_CURRENT_FLOWS_MODE");
  expect(runtimeSources).not.toContain("WORKFLOW_ENGINE_MODE");
  expect(runtimeSources).not.toContain("recordWorkflowShadowEvent");
  expect(runtimeSources).not.toContain('mode: "shadow"');
});

test("direct SMS uses the organization number without a customer consent gate", () => {
  const definition = workflowNodeDefinition("action.sendDirectSms");
  expect(definition).toMatchObject({
    name: "Send SMS",
    connection: "sms",
    retry: "none",
    executor: "communication.sendDirectSms",
  });
  expect(
    definition?.validate({
      enabled: true,
      recipients: [{ name: "Operations", phone: "+19195550123" }],
      body: "New lead: {{event.payload.name}}",
    }).valid,
  ).toBe(true);
  const executor = readFileSync("lib/workflows/executors.ts", "utf8");
  expect(executor).toContain('handlers.set("communication.sendDirectSms"');
  expect(executor).toContain("sendOrganizationSms(input.organizationId");
  expect(executor).not.toContain(
    'handlers.set("communication.sendDirectSms", async (input) => {\n  return sendCustomerSms',
  );
  const migration = readFileSync(
    "supabase/migrations/202611030004_premium_lead_sms_notifications.sql",
    "utf8",
  );
  expect(migration).toContain("+19194139782");
  expect(migration).toContain("+19194344860");
  expect(migration).toContain("action.sendDirectSms");
});

test("new-organization website starter is generic, disabled, and publishable", () => {
  const starter = websiteLeadWorkflowSeed({
    sendTeamNotification: false,
    teamNotificationMode: "disabled_custom_https",
    triggerMode: "inbound_webhook",
  });
  const validation = workflowCanPublish(starter);
  expect(validation.valid, JSON.stringify(validation.issues, null, 2)).toBe(
    true,
  );
  const notification = starter.graph.nodes.find(
    (node) => node.id === "team-notification",
  );
  expect(notification).toMatchObject({
    type: "action.webhook",
    name: "Notify team with HTTPS",
    config: {
      enabled: false,
      destination: "custom",
      url: "",
    },
  });
  expect(JSON.stringify(notification)).not.toContain("Premium Remodel");
  expect(JSON.stringify(notification)).not.toContain("discord_lead_webhook");
  expect(starter.graph.nodes[0]).toMatchObject({
    type: "trigger.inboundWebhook",
    config: { eventType: "webhook.inbound.received" },
  });
  expect(JSON.stringify(starter)).not.toContain("templateKey");
});

test("Premium lead HTTPS delivery moves its URL into the organization vault", () => {
  const secretId = randomUUID();
  const migrated = websiteLeadWorkflowSeed({
    teamNotificationMode: "legacy_discord",
    compatibilityMode: "premium_legacy",
    teamNotificationUrlSecretId: secretId,
  });
  const notification = migrated.graph.nodes.find(
    (node) => node.id === "team-notification",
  );
  expect(notification?.config).toMatchObject({
    destination: "custom",
    url: "",
    urlSecretId: secretId,
  });
  expect(JSON.stringify(notification?.config)).not.toContain(
    "discord_lead_webhook",
  );
});

test("every registered capability publishes typed executor input and output contracts", () => {
  const sampleEvent = event("workflow.manual");
  expect(workflowNodeDefinitions.length).toBeGreaterThan(20);
  for (const definition of workflowNodeDefinitions) {
    expect(
      definition.inputSchema.safeParse({
        organizationId: sampleEvent.organizationId,
        runId: randomUUID(),
        nodeId: "test-node",
        idempotencyKey: `test:${definition.type}`,
        event: sampleEvent,
        context: {},
      }).success,
      `${definition.type} must accept the standard typed execution envelope`,
    ).toBe(true);
    expect(
      definition.outputSchema.safeParse({}).success,
      `${definition.type} must define a valid output envelope`,
    ).toBe(true);
    expect(
      definition.requiredPermissions.length,
      `${definition.type} must declare its permission boundary`,
    ).toBeGreaterThan(0);
    expect(
      definition.context.length,
      `${definition.type} must declare the contexts its editor and executor may use`,
    ).toBeGreaterThan(0);
  }
});

test("HTTPS actions reference vault secrets without storing their values", () => {
  const definition = workflowNodeDefinition("action.webhook");
  expect(definition).toBeTruthy();
  const urlSecretId = randomUUID();
  const authorizationSecretId = randomUUID();
  const parsed = definition!.configSchema.safeParse({
    enabled: true,
    destination: "custom",
    method: "POST",
    url: "",
    urlSecretId,
    headers: { "X-Visible-Metadata": "workflow" },
    secretHeaders: { Authorization: authorizationSecretId },
    bodyType: "json",
    body: '{"lead":"{{event.objectId}}"}',
    missingValueBehavior: "blank",
    timeoutSeconds: 15,
    saveResponse: false,
  });
  expect(parsed.success).toBe(true);
  expect(JSON.stringify(parsed.success ? parsed.data : {})).not.toContain(
    "Bearer private",
  );
  expect(
    definition!.configSchema.safeParse({
      enabled: true,
      destination: "custom",
      method: "POST",
      url: "https://example.com/hook",
      headers: { Authorization: "Bearer private" },
      secretHeaders: {},
      bodyType: "json",
      body: "{}",
      missingValueBehavior: "blank",
      timeoutSeconds: 15,
      saveResponse: false,
    }).success,
  ).toBe(false);
  expect(
    definition!.configSchema.safeParse({
      enabled: true,
      destination: "custom",
      method: "POST",
      url: "https://example.com/hook",
      headers: {},
      secretHeaders: { "Transfer-Encoding": randomUUID() },
      bodyType: "json",
      body: "{}",
      missingValueBehavior: "blank",
      timeoutSeconds: 15,
      saveResponse: false,
    }).success,
  ).toBe(false);
});

test("workflow traces recursively redact credentials and authorization material", () => {
  expect(
    redactWorkflowValue({
      authorization: "Bearer private",
      nested: {
        api_key: "private",
        clientSecret: "private",
        visible: "kept",
      },
    }),
  ).toEqual({
    authorization: "[redacted]",
    nested: {
      api_key: "[redacted]",
      clientSecret: "[redacted]",
      visible: "kept",
    },
  });
});

test("website workflow plans eligible communication branches in order", () => {
  const result = simulateWorkflow(
    websiteLeadWorkflowSeed(),
    event("website.form.submitted", {
      firstName: "Taylor",
      lastName: "Reed",
      name: "Taylor Reed",
      email: "taylor@example.com",
      phone: "+19195550123",
      address: "123 Main St",
      zip: "27511",
      project: "Kitchen Remodel",
      description: "New cabinets",
      smsAppointmentOptIn: true,
      smsMarketingOptIn: false,
    }),
    { organization: { name: "Premium Remodel" } },
  );
  expect(result.valid).toBe(true);
  expect(result.matchedTriggers).toEqual(["website-form"]);
  const router = result.steps.find((step) => step.nodeId === "delivery-router");
  expect(router?.summary).toContain(
    "Email available, Appointment texts accepted, Team notification",
  );
  expect(result.steps.map((step) => step.nodeId)).toEqual(
    expect.arrayContaining([
      "confirmation-email",
      "sms-policy",
      "confirmation-sms",
      "team-notification",
    ]),
  );
  expect(
    result.steps
      .map((step) => step.nodeId)
      .filter((nodeId) =>
        [
          "confirmation-email",
          "sms-policy",
          "confirmation-sms",
          "team-notification",
        ].includes(nodeId),
      ),
  ).toEqual([
    "confirmation-email",
    "sms-policy",
    "confirmation-sms",
    "team-notification",
  ]);
  expect(
    result.steps.find((step) => step.nodeId === "confirmation-sms")?.preview,
  ).toEqual(
    expect.objectContaining({
      systemPolicy: "SMS consent and DND enforced",
      body: expect.stringContaining(
        "We received your Kitchen Remodel request.",
      ),
    }),
  );
});

test("website workflow skips email and SMS branches without values or consent", () => {
  const result = simulateWorkflow(
    websiteLeadWorkflowSeed(),
    event("website.form.submitted", {
      name: "Phone-free lead",
      email: "",
      phone: "",
      project: "Bathroom Remodel",
      smsAppointmentOptIn: false,
    }),
  );
  expect(
    result.steps.some((step) => step.nodeId === "confirmation-email"),
  ).toBe(false);
  expect(result.steps.some((step) => step.nodeId === "confirmation-sms")).toBe(
    false,
  );
  expect(result.steps.some((step) => step.nodeId === "team-notification")).toBe(
    true,
  );
});

test("If Else chooses the first match and compliance uses fallback for other text", () => {
  const stop = simulateWorkflow(
    smsComplianceWorkflowSeed(),
    event("sms.inbound.received", { complianceType: "stop" }),
  );
  expect(stop.steps.some((step) => step.nodeId === "apply-stop")).toBe(true);
  expect(stop.steps.some((step) => step.nodeId === "apply-start")).toBe(false);
  const other = simulateWorkflow(
    smsComplianceWorkflowSeed(),
    event("sms.inbound.received", { complianceType: null }),
  );
  expect(other.steps.at(-1)).toEqual(
    expect.objectContaining({ nodeId: "end-other", status: "completed" }),
  );
});

test("validator rejects implicit fanout, missing fallback, and implicit cycles", () => {
  const invalid = structuredClone(
    websiteLeadWorkflowSeed(),
  ) as WorkflowDefinition;
  const decision = invalid.graph.nodes.find(
    (node) => node.id === "delivery-router",
  )!;
  decision.type = "logic.ifElse";
  decision.outgoing = decision.outgoing.filter(
    (edge) => edge.kind !== "fallback",
  );
  const contact = invalid.graph.nodes.find(
    (node) => node.id === "find-contact",
  )!;
  contact.outgoing.push({
    id: "bad-fanout",
    to: "website-form",
    label: "Loop",
    order: 1,
    kind: "default",
  });
  const result = workflowCanPublish(invalid);
  expect(result.valid).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      "ifelse_fallback",
      "implicit_fanout",
      "implicit_cycle",
    ]),
  );
});

test("explicit Go To loops remain bounded by visit and step limits", async () => {
  const definition = workflowTemplateDefinition("blank", "contact");
  definition.graph.nodes = [
    {
      id: "manual-trigger",
      type: "trigger.manual",
      kind: "trigger",
      name: "Manual enrollment",
      config: { eventType: "workflow.manual" },
      outgoing: [
        {
          id: "trigger-router",
          to: "router",
          label: "Continue",
          order: 0,
          kind: "default",
        },
      ],
    },
    {
      id: "router",
      type: "logic.router",
      kind: "decision",
      name: "Loop router",
      config: {},
      outgoing: [
        {
          id: "always-loop",
          to: "go-to",
          label: "Loop",
          order: 0,
          kind: "always",
        },
        {
          id: "fallback-end",
          to: "end",
          label: "Otherwise",
          order: 1,
          kind: "fallback",
        },
      ],
    },
    {
      id: "go-to",
      type: "control.goto",
      kind: "control",
      name: "Return to router",
      config: {},
      outgoing: [
        {
          id: "go-to-router",
          to: "router",
          label: "Continue",
          order: 0,
          kind: "default",
        },
      ],
    },
    {
      id: "end",
      type: "control.end",
      kind: "terminal",
      name: "End workflow",
      config: { reason: "Completed" },
      outgoing: [],
    },
  ];
  definition.settings.maximumVisitsPerNode = 2;
  definition.settings.maximumSteps = 20;
  expect(workflowCanPublish(definition).valid).toBe(true);
  await expect(
    runWorkflowRuntime({
      definition,
      event: event("workflow.manual"),
      execute: async () => ({ status: "completed", summary: "Continued." }),
    }),
  ).rejects.toThrow("Maximum visits reached for Loop router.");
});

test("conditions resolve dynamic values without executing code", () => {
  const trace = evaluateWorkflowCondition(
    {
      kind: "group",
      combinator: "and",
      conditions: [
        {
          kind: "comparison",
          left: { kind: "reference", path: "quote.total" },
          operator: "greaterThan",
          right: { kind: "literal", value: 20_000 },
        },
        {
          kind: "comparison",
          left: { kind: "reference", path: "contact.email" },
          operator: "isNotEmpty",
        },
      ],
    },
    { quote: { total: 25_000 }, contact: { email: "client@example.com" } },
  );
  expect(trace.result).toBe(true);
  expect(isSafeWorkflowRegex("^(kitchen|bathroom)$")).toBe(true);
  expect(isSafeWorkflowRegex("(a+)+$")).toBe(false);
});

test("interpolation has explicit missing-value behavior", () => {
  expect(
    interpolateWorkflowText(
      "Hi {{contact.firstName}}",
      { contact: {} },
      {
        missing: "fallback",
        fallback: "there",
      },
    ),
  ).toEqual({ value: "Hi there", skipped: false, missing: true });
  expect(
    interpolateWorkflowText(
      "Hi {{contact.firstName}}",
      { contact: {} },
      {
        missing: "skip",
      },
    ).skipped,
  ).toBe(true);
  expect(() =>
    interpolateWorkflowText(
      "Hi {{contact.firstName}}",
      { contact: {} },
      {
        missing: "error",
      },
    ),
  ).toThrow("contact.firstName is missing");
});

test("JSON request interpolation preserves types and escapes customer text", () => {
  const rendered = interpolateWorkflowJson(
    JSON.stringify({
      name: "{{event.payload.name}}",
      optedIn: "{{event.payload.optedIn}}",
      note: "Lead: {{event.payload.note}}",
      missing: "{{event.payload.missing}}",
    }),
    {
      event: {
        payload: {
          name: 'Taylor "T" Reed',
          optedIn: true,
          note: "Kitchen\nremodel",
        },
      },
    },
    { missing: "fallback", fallback: "Not provided" },
  );
  expect(JSON.parse(rendered.value)).toEqual({
    name: 'Taylor "T" Reed',
    optedIn: true,
    note: "Lead: Kitchen\nremodel",
    missing: "Not provided",
  });
});

test("outbound webhooks reject private networks and inline credentials", () => {
  expect(isPublicWorkflowWebhookUrl("https://hooks.example.com/lead")).toBe(
    true,
  );
  expect(isPublicWorkflowWebhookUrl("http://hooks.example.com/lead")).toBe(
    false,
  );
  expect(isPublicWorkflowWebhookUrl("https://127.0.0.1/lead")).toBe(false);
  expect(isPublicWorkflowWebhookUrl("https://192.168.1.20/lead")).toBe(false);
  expect(isPublicWorkflowWebhookUrl("https://192.0.2.20/lead")).toBe(false);
  expect(isPublicWorkflowWebhookUrl("https://198.51.100.20/lead")).toBe(false);
  expect(isPublicWorkflowWebhookUrl("https://203.0.113.20/lead")).toBe(false);
  expect(isPublicWorkflowWebhookUrl("https://203.0.1.20/lead")).toBe(true);
  expect(isPublicWorkflowWebhookUrl("https://metadata.internal/lead")).toBe(
    false,
  );
  expect(
    isPublicWorkflowWebhookUrl("https://user:secret@example.com/lead"),
  ).toBe(false);
  expect(isSensitiveWorkflowHeader("Authorization")).toBe(true);
  expect(isSensitiveWorkflowHeader("Host")).toBe(true);
  expect(isSensitiveWorkflowHeader("Content-Length")).toBe(true);
  expect(isSensitiveWorkflowHeader("Transfer-Encoding")).toBe(true);
  expect(isSensitiveWorkflowHeader("X-Trace-Id")).toBe(false);
});

test("outbound webhooks pin the validated public address for the TLS request", () => {
  const source = readFileSync("lib/workflows/webhook-safety.server.ts", "utf8");
  expect(source).toContain("new BlockList()");
  expect(source).toContain("hostname: destination.address");
  expect(source).toContain("servername: url.hostname");
  expect(source).toContain("headers: { ...options.headers, Host: url.host }");
  expect(source).toContain("Math.min(50_000");
});

test("Send SMS cannot be published without its non-bypassable system policy gate", () => {
  const unsafe = structuredClone(
    websiteLeadWorkflowSeed(),
  ) as WorkflowDefinition;
  const router = unsafe.graph.nodes.find(
    (node) => node.id === "delivery-router",
  )!;
  router.outgoing.find((edge) => edge.id === "router-sms")!.to =
    "confirmation-sms";
  const result = workflowCanPublish(unsafe);
  expect(result.valid).toBe(false);
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "sms_policy_gate",
        nodeId: "confirmation-sms",
      }),
    ]),
  );
});

test("runtime persists a wait continuation and resumes on the pinned version", async () => {
  const definition = websiteLeadWorkflowSeed();
  const email = definition.graph.nodes.find(
    (node) => node.id === "confirmation-email",
  )!;
  const emailEnd = email.outgoing[0].to;
  const waitId = "wait-before-email-end";
  email.outgoing[0].to = waitId;
  definition.graph.nodes.push({
    id: waitId,
    type: "logic.wait",
    kind: "wait",
    name: "Wait one hour",
    config: { mode: "duration", amount: 1, unit: "hours" },
    outgoing: [
      {
        id: "wait-email-end",
        to: emailEnd,
        label: "Resume",
        order: 0,
        kind: "default",
      },
    ],
  });
  const calls: string[] = [];
  const execute: WorkflowRuntimeExecutor = async ({ node }) => {
    calls.push(node.id);
    return { output: { nodeId: node.id } };
  };
  const started = new Date("2026-10-31T12:00:00.000Z");
  const first = await runWorkflowRuntime({
    definition,
    event: event("website.form.submitted", {
      email: "contact@example.com",
      phone: "",
      smsAppointmentOptIn: false,
    }),
    execute,
    now: started,
  });
  expect(first.status).toBe("waiting");
  expect(first.wait?.wakeAt).toBe("2026-10-31T13:00:00.000Z");
  const pinned = structuredClone(definition);
  definition.graph.nodes.find((node) => node.id === emailEnd)!.name =
    "Changed draft end";
  const resumed = await runWorkflowRuntime({
    definition: pinned,
    event: event("website.form.submitted", {}),
    execute,
    state: first.wait!.continuation,
    now: new Date(first.wait!.wakeAt!),
  });
  expect(resumed.status).toBe("completed");
  expect(resumed.steps.at(-1)?.name).not.toBe("Changed draft end");
});

test("a failed action exposes a resumable continuation with a stable effect key", async () => {
  const definition = websiteLeadWorkflowSeed();
  const workflowEvent = event("website.form.submitted", {
    name: "Retry Test",
    email: "retry@example.com",
    phone: "",
    smsAppointmentOptIn: false,
  });
  let failure: WorkflowNodeExecutionError | undefined;
  try {
    await runWorkflowRuntime({
      definition,
      event: workflowEvent,
      execute: async ({ node }) => {
        if (node.id === "find-contact")
          throw new Error("temporary provider failure");
        return {};
      },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowNodeExecutionError);
    failure = error as WorkflowNodeExecutionError;
  }
  expect(failure?.idempotencyKey).toBe(`${workflowEvent.id}:find-contact:1`);
  expect(failure?.state.queue[0]?.nodeId).toBe("find-contact");
  const keys: string[] = [];
  const resumed = await runWorkflowRuntime({
    definition,
    event: workflowEvent,
    state: failure!.state,
    execute: async ({ idempotencyKey }) => {
      keys.push(idempotencyKey);
      return {};
    },
  });
  expect(resumed.status).toBe("completed");
  expect(keys[0]).toBe(failure?.idempotencyKey);
});

test("communication actions pause durably outside the published sending window", async () => {
  const definition = websiteLeadWorkflowSeed();
  definition.settings.communicationWindow = {
    enabled: true,
    days: [1, 2, 3, 4, 5],
    start: "08:00",
    end: "18:00",
  };
  const result = await runWorkflowRuntime({
    definition,
    event: event("website.form.submitted", {
      name: "Window Test",
      email: "window@example.com",
      phone: "",
      smsAppointmentOptIn: false,
    }),
    execute: async () => ({}),
    now: new Date("2026-10-31T16:00:00.000Z"),
  });
  expect(result.status).toBe("waiting");
  expect(result.steps.at(-1)?.nodeId).toBe("confirmation-email");
  expect(result.wait?.wakeAt).toBe("2026-11-02T13:00:00.000Z");
});

test("scheduled triggers require a bounded one-time or interval schedule", () => {
  const schedule = workflowNodeDefinition("trigger.schedule");
  expect(schedule).toBeDefined();
  expect(
    schedule?.configSchema.safeParse({
      eventType: "schedule.reached",
      schedule: { mode: "once", at: "2026-11-03T14:00:00.000Z" },
    }).success,
  ).toBe(true);
  expect(
    schedule?.configSchema.safeParse({
      eventType: "schedule.reached",
      schedule: { mode: "interval", amount: 0, unit: "minutes" },
    }).success,
  ).toBe(false);
});

test("record mutations emit composable domain events with field transitions", () => {
  const organizationId = randomUUID();
  const id = randomUUID();
  const leadEvents = workflowRecordEvents({
    organizationId,
    actor: { type: "user", id: randomUUID(), name: "Admin" },
    kind: "lead",
    before: { id, status: "New", disposition: "Active" },
    after: {
      id,
      status: "Qualified",
      disposition: "Won",
      updatedAt: "2026-10-31T16:00:00.000Z",
    },
  });
  expect(leadEvents.map((item) => item.type)).toEqual([
    "lead.stage.changed",
    "lead.disposition.changed",
  ]);
  expect(leadEvents[0].payload.changes).toEqual(
    expect.objectContaining({
      status: { from: "New", to: "Qualified" },
      disposition: { from: "Active", to: "Won" },
    }),
  );

  const itemEvents = workflowRecordEvents({
    organizationId,
    actor: { type: "system" },
    kind: "task",
    before: { id, status: "In progress", contractorId: null },
    after: {
      id,
      status: "Done",
      contractorId: randomUUID(),
      updatedAt: "2026-10-31T17:00:00.000Z",
    },
  });
  expect(itemEvents.map((item) => item.type)).toEqual([
    "item.assigned",
    "item.completed",
  ]);
  expect(itemEvents.every((item) => item.objectType === "item")).toBe(true);
});

test("changed-from and changed-to conditions read the event change set", () => {
  const traceFrom = evaluateWorkflowCondition(
    {
      kind: "comparison",
      left: { kind: "reference", path: "event.changes.status" },
      operator: "changedFrom",
      right: { kind: "literal", value: "New" },
    },
    { event: { changes: { status: { from: "New", to: "Qualified" } } } },
  );
  const traceTo = evaluateWorkflowCondition(
    {
      kind: "comparison",
      left: { kind: "reference", path: "event.changes.status" },
      operator: "changedTo",
      right: { kind: "literal", value: "Qualified" },
    },
    { event: { changes: { status: { from: "New", to: "Qualified" } } } },
  );
  expect(traceFrom.result).toBe(true);
  expect(traceTo.result).toBe(true);
});

test("starter templates are ordinary publishable workflow definitions", () => {
  for (const [template, objectType] of [
    ["lead-follow-up", "lead"],
    ["project-item-handoff", "project"],
    ["invoice-payment-reminders", "invoice"],
  ] as const) {
    const definition = workflowTemplateDefinition(template, objectType);
    const validation = workflowCanPublish(definition);
    expect(validation.valid, JSON.stringify(validation.issues, null, 2)).toBe(
      true,
    );
    expect(definition.graph.primaryObjectType).toBe(objectType);
  }
});

test("invoice reminders stop when payment arrives and continue after a timeout", async () => {
  const definition = workflowTemplateDefinition(
    "invoice-payment-reminders",
    "invoice",
  );
  const objectId = randomUUID();
  const created = {
    ...event("invoice.created", {
      invoiceNumber: "INV-1042",
      customerName: "Taylor Reed",
      email: "taylor@example.com",
      phone: "+19195550123",
      amountDue: "$4,250.00",
      invoiceUrl: "https://example.com/invoice",
    }),
    objectType: "invoice" as const,
    objectId,
  };
  const calls: string[] = [];
  const execute: WorkflowRuntimeExecutor = async ({ node }) => {
    calls.push(node.id);
    return { output: { status: "ok" } };
  };
  const started = new Date("2026-11-01T12:00:00.000Z");
  const first = await runWorkflowRuntime({
    definition,
    event: created,
    execute,
    now: started,
  });
  expect(first.status).toBe("waiting");
  expect(first.wait?.awaitedEventType).toBe("invoice.payment.received");

  const payment = {
    ...event("invoice.payment.received", { quoteId: objectId, amount: 4_250 }),
    objectType: "invoice" as const,
    objectId,
  };
  const paidState = structuredClone(first.wait!.continuation);
  paidState.context.event = { ...payment, payload: payment.payload };
  paidState.context.trigger = { eventType: payment.type };
  const paid = await runWorkflowRuntime({
    definition,
    event: payment,
    execute,
    state: paidState,
    now: new Date("2026-11-02T12:00:00.000Z"),
  });
  expect(paid.status).toBe("completed");
  expect(paid.steps.at(-1)?.name).toBe("Payment received");
  expect(calls).not.toContain("first-email");

  const timeoutCalls: string[] = [];
  const timedOut = await runWorkflowRuntime({
    definition,
    event: created,
    execute: async ({ node }) => {
      timeoutCalls.push(node.id);
      return { output: { status: "ok" } };
    },
    state: structuredClone(first.wait!.continuation),
    now: new Date(first.wait!.timeoutAt!),
  });
  expect(timedOut.status).toBe("waiting");
  expect(timeoutCalls).toEqual([]);
  expect(timedOut.steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: "first-email",
        status: "waiting",
      }),
    ]),
  );
  expect(timedOut.wait?.mode).toBe("timestamp");
});

test("timestamp waits honor continue, exit, and skip-communications past behavior", async () => {
  const makeDefinition = (
    pastBehavior: "continue" | "exit" | "skip_communications",
  ) => {
    const definition = workflowTemplateDefinition("blank", "contact");
    const trigger = definition.graph.nodes.find(
      (node) => node.id === "manual-trigger",
    )!;
    trigger.outgoing[0].to = "past-wait";
    definition.graph.nodes.splice(
      1,
      0,
      {
        id: "past-wait",
        type: "logic.wait",
        kind: "wait",
        name: "Wait until appointment",
        config: {
          mode: "timestamp",
          timestamp: { kind: "literal", value: "2026-10-30T12:00:00.000Z" },
          pastBehavior,
        },
        outgoing: [
          {
            id: "wait-email",
            to: "email",
            kind: "default",
            label: "Continue",
            order: 0,
          },
        ],
      },
      {
        id: "email",
        type: "action.sendEmail",
        kind: "action",
        name: "Appointment reminder",
        config: {
          enabled: true,
          recipient: { kind: "literal", value: "contact@example.com" },
          subject: "Reminder",
          body: "Reminder",
          missingValueBehavior: "skip",
        },
        outgoing: [
          {
            id: "email-end",
            to: "end",
            kind: "default",
            label: "Continue",
            order: 0,
          },
        ],
      },
    );
    return definition;
  };
  const now = new Date("2026-10-31T12:00:00.000Z");
  for (const behavior of ["continue", "exit", "skip_communications"] as const) {
    const calls: string[] = [];
    const result = await runWorkflowRuntime({
      definition: makeDefinition(behavior),
      event: event("workflow.manual"),
      now,
      execute: async ({ node }) => {
        calls.push(node.id);
        return {};
      },
    });
    expect(result.status).toBe("completed");
    if (behavior === "continue") expect(calls).toContain("email");
    else expect(calls).not.toContain("email");
    if (behavior === "skip_communications")
      expect(result.steps.find((step) => step.nodeId === "email")?.status).toBe(
        "skipped",
      );
    if (behavior === "exit")
      expect(result.steps.some((step) => step.nodeId === "end")).toBe(false);
  }
});

test("event waits expose an explicit timeout policy", () => {
  const wait = workflowNodeDefinition("logic.wait");
  expect(
    wait?.configSchema.safeParse({
      mode: "event",
      eventType: "quote.accepted",
      timeoutSeconds: 86_400,
      timeoutBehavior: "exit",
    }).success,
  ).toBe(true);
  expect(
    wait?.configSchema.safeParse({
      mode: "event",
      eventType: "quote.accepted",
      timeoutSeconds: 86_400,
      timeoutBehavior: "invented-policy",
    }).success,
  ).toBe(false);
});
