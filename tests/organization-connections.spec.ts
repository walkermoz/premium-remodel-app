import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  demoConnectionRegistry,
  type OrganizationConnectionRegistry,
} from "../lib/organization-connections.types";
import {
  workflowConnectionIssues,
  workflowNodeConnectionRequirement,
} from "../lib/workflows/connection-validation";
import { websiteLeadWorkflowSeed } from "../lib/workflows/seeds";
import type { WorkflowDefinition, WorkflowNode } from "../lib/workflows/schema";

function registryWith(
  id: keyof OrganizationConnectionRegistry["capabilities"],
  state: OrganizationConnectionRegistry["capabilities"][typeof id]["state"],
) {
  const registry = demoConnectionRegistry();
  registry.capabilities[id] = {
    ...registry.capabilities[id],
    state,
    detail: `${registry.capabilities[id].label} needs setup.`,
  };
  return registry;
}

function updateNode(
  definition: WorkflowDefinition,
  id: string,
  update: (node: WorkflowNode) => WorkflowNode,
) {
  return {
    ...definition,
    graph: {
      ...definition.graph,
      nodes: definition.graph.nodes.map((node) =>
        node.id === id ? update(node) : node,
      ),
    },
  } satisfies WorkflowDefinition;
}

test("required workflow connections block publishing and optional actions warn", () => {
  const definition = websiteLeadWorkflowSeed();
  const missingMail = registryWith("google_mail", "missing");
  const required = workflowConnectionIssues(definition, missingMail);
  expect(required).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: "confirmation-email",
        severity: "error",
        code: "connection_unavailable",
      }),
    ]),
  );

  const optionalDefinition = updateNode(
    definition,
    "confirmation-email",
    (node) => ({
      ...node,
      config: { ...node.config, connectionFailureBehavior: "skip" },
    }),
  );
  expect(workflowConnectionIssues(optionalDefinition, missingMail)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: "confirmation-email",
        severity: "warning",
        code: "optional_connection_unavailable",
      }),
    ]),
  );

  const disabledDefinition = updateNode(
    definition,
    "confirmation-email",
    (node) => ({ ...node, config: { ...node.config, enabled: false } }),
  );
  expect(
    workflowConnectionIssues(disabledDefinition, missingMail).some(
      (issue) => issue.nodeId === "confirmation-email",
    ),
  ).toBe(false);
});

test("direct SMS actions require the organization Twilio connection", () => {
  expect(
    workflowNodeConnectionRequirement({
      id: "lead-alert-sms",
      type: "action.sendDirectSms",
      kind: "action",
      name: "Send SMS",
      config: {
        enabled: true,
        recipients: [{ name: "Matt", phone: "+19194139782" }],
        body: "New lead",
      },
      outgoing: [],
    }),
  ).toEqual({ capabilityId: "twilio_sms", label: "company texting" });
});

test("arbitrary public HTTPS actions need no prior connection, while protected requests need their exact secret", () => {
  const definition = websiteLeadWorkflowSeed();
  const webhook = definition.graph.nodes.find(
    (node) => node.id === "team-notification",
  )!;
  const publicWebhook = {
    ...webhook,
    config: {
      ...webhook.config,
      destination: "custom",
      url: "https://example.com/events",
      urlSecretId: undefined,
      secretHeaders: {},
    },
  } as WorkflowNode;
  expect(workflowNodeConnectionRequirement(publicWebhook)).toBeNull();

  const protectedWebhook = {
    ...publicWebhook,
    config: {
      ...publicWebhook.config,
      url: "",
      urlSecretId: "missing-secret-id",
    },
  } as WorkflowNode;
  expect(workflowNodeConnectionRequirement(protectedWebhook)).toEqual({
    capabilityId: "workflow_secrets",
    label: "workflow secrets",
  });
  const protectedDefinition = updateNode(
    definition,
    "team-notification",
    () => protectedWebhook,
  );
  expect(
    workflowConnectionIssues(
      protectedDefinition,
      demoConnectionRegistry(),
      new Set(),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nodeId: "team-notification",
        severity: "error",
        message: expect.stringContaining("no longer exist"),
      }),
    ]),
  );
});

test("integration controls and onboarding use the central connection registry", () => {
  const quote = readFileSync("components/quotes-panel.tsx", "utf8");
  const payments = readFileSync("components/project-payments.tsx", "utf8");
  const generation = readFileSync("components/generate-panel.tsx", "utf8");
  const quotePhotos = readFileSync("components/quote-photos-panel.tsx", "utf8");
  const msa = readFileSync("components/msa-draft-panel.tsx", "utf8");
  const team = readFileSync("components/team-panel.tsx", "utf8");
  const workflow = readFileSync(
    "components/workflow-automation-panel.tsx",
    "utf8",
  );
  const onboarding = readFileSync("app/api/onboarding/status/route.ts", "utf8");

  expect(quote).toContain('useOrganizationConnection("google_mail", demo)');
  expect(payments).toContain(
    'useOrganizationConnection("stripe_payments", demo)',
  );
  expect(generation).toContain(
    'useOrganizationConnection("openrouter_generation", demo)',
  );
  expect(quotePhotos).toContain(
    'useOrganizationConnection("openrouter_generation", demo)',
  );
  expect(msa).toContain('useOrganizationConnection("google_mail", demo)');
  expect(team).toContain('useOrganizationConnection("twilio_sms", demo)');
  expect(workflow).toContain("workflowConnectionIssues(");
  expect(workflow).toContain("Optional action");
  expect(onboarding).toContain("getOrganizationConnectionRegistry(user)");
  expect(onboarding).toContain("connections: connectionRegistry.capabilities");
});

test("connection status endpoints are authenticated and never cached", () => {
  const statusRoute = readFileSync(
    "app/api/connections/status/route.ts",
    "utf8",
  );
  const workflowConnections = readFileSync(
    "app/api/workflows/connections/route.ts",
    "utf8",
  );
  expect(statusRoute).toContain("await requireUser()");
  expect(statusRoute).toContain('"Cache-Control": "private, no-store"');
  expect(workflowConnections).toContain("registry,");
});
