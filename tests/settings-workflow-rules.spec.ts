import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { defaultOperatingSettings } from "@/lib/operating-settings";
import { applyOperatingRecord } from "@/lib/operating-records";
import {
  seededLeadEmailBody,
  seededLeadEmailSubject,
  usesCompanyLeadTemplate,
  renderCompanyLeadTemplate,
} from "@/lib/workflows/message-templates";
import { websiteLeadWorkflowSeed } from "@/lib/workflows/seeds";
import { workflowNodeDefinition } from "@/lib/workflows/registry";
import { simulateWorkflow } from "@/lib/workflows/simulator";
import type { WorkflowEvent } from "@/lib/workflows/schema";

test("company email mode follows saved defaults without replacing customized workflow copy", () => {
  const old = {
    subject: seededLeadEmailSubject,
    body: seededLeadEmailBody,
    resultTracking: { field: "emailAcknowledgement" },
  };
  expect(usesCompanyLeadTemplate(old)).toBe(true);
  expect(
    usesCompanyLeadTemplate({ ...old, body: "Our customized response" }),
  ).toBe(false);
  expect(usesCompanyLeadTemplate({ ...old, messageTemplate: "custom" })).toBe(
    false,
  );
  const schema = workflowNodeDefinition("action.sendEmail")!.configSchema;
  const recipient = { kind: "literal", value: "qa@example.test" };
  expect(
    schema.safeParse({ recipient, messageTemplate: "leadAcknowledgement" })
      .success,
  ).toBe(true);
  expect(
    schema.safeParse({
      recipient,
      messageTemplate: "custom",
      subject: "",
      body: "",
    }).success,
  ).toBe(false);
});

test("saved company templates render consistently in workflow previews", () => {
  const messages = {
    ...defaultOperatingSettings().messages,
    leadSubject: "{{businessName}} received your request",
    leadBody: "Hello {{firstName}}, thanks from {{senderName}}.",
  };
  const context = {
    organization: { name: "QA Remodel" },
    contact: { firstName: "Jordan" },
  };
  expect(renderCompanyLeadTemplate(messages, context)).toEqual({
    subject: "QA Remodel received your request",
    body: "Hello Jordan, thanks from QA Remodel Team.",
  });
  const event: WorkflowEvent = {
    id: randomUUID(),
    schemaVersion: 1,
    type: "website.form.submitted",
    organizationId: randomUUID(),
    actor: { type: "system" },
    objectType: "lead",
    objectId: randomUUID(),
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    idempotencyKey: randomUUID(),
    payload: { firstName: "Sam", email: "qa@example.test" },
  };
  const result = simulateWorkflow(
    websiteLeadWorkflowSeed(),
    event,
    context,
    messages,
  );
  expect(result.valid).toBe(true);
  expect(
    result.steps.find((s) => s.nodeId === "confirmation-email")?.preview,
  ).toMatchObject({
    subject: "QA Remodel received your request",
    body: "Hello Sam, thanks from QA Remodel Team.",
  });
});

test("intake keeps incomplete leads while validating typed values and applying defaults", () => {
  const settings = defaultOperatingSettings();
  settings.customFields = [
    {
      id: "access",
      label: "Access",
      type: "text",
      required: true,
      defaultValue: null,
      options: [],
      targets: ["contact"],
      transfer: true,
      clientVisible: false,
      archived: false,
    },
    {
      id: "count",
      label: "Count",
      type: "number",
      required: false,
      defaultValue: 2,
      options: [],
      targets: ["contact"],
      transfer: false,
      clientVisible: false,
      archived: false,
    },
  ];
  const apply = (input: Record<string, unknown>, strict = false) =>
    applyOperatingRecord(
      settings,
      "contact",
      input,
      null,
      "Capture",
      new Date().toISOString(),
      undefined,
      { requireCustomFields: strict },
    );
  expect(apply({}).customValues).toMatchObject({ count: 2 });
  expect(() => apply({}, true)).toThrow(/Access/);
  expect(() => apply({ customValues: { count: "invalid" } })).toThrow(/Count/);
});

test("system handoff preserves quoted payment terms and applies required project forms", () => {
  const settings = defaultOperatingSettings();
  settings.invoices.depositPercent = 70;
  const frozen = { ...settings.invoices, depositPercent: 30 };
  const result = applyOperatingRecord(
    settings,
    "project",
    { status: "Planning" },
    null,
    "Workflow",
    new Date().toISOString(),
    undefined,
    { requireCustomFields: false, inheritedInvoiceDefaults: frozen },
  );
  expect(result.invoiceDefaults).toEqual(frozen);
  const updated = applyOperatingRecord(
    settings,
    "project",
    { ...result, invoiceDefaults: settings.invoices },
    result,
    "Workflow",
    new Date().toISOString(),
    undefined,
    { requireCustomFields: false },
  );
  expect(updated.invoiceDefaults).toEqual(frozen);
});
