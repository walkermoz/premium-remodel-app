import { test, expect } from "@playwright/test";
import { collectSmsDeliveries } from "../lib/workflows/sms-deliveries";
import {
  WorkflowActionError,
  WorkflowNodeExecutionError,
  runWorkflowRuntime,
} from "../lib/workflows/runtime";
import { websiteLeadWorkflowSeed } from "../lib/workflows/seeds";

const recipients = [
  { name: "First", phone: "+19195550101" },
  { name: "Second", phone: "+19195550102" },
  { name: "Third", phone: "+19195550103" },
];

test("mixed SMS results preserve every accepted SID and failed recipient without raw provider details", async () => {
  const calls: string[] = [];
  const result = await collectSmsDeliveries(recipients, async (recipient) => {
    calls.push(recipient.phone);
    if (recipient.name === "Second")
      throw new Error("secret provider request data");
    return { sid: `SM-${recipient.name}` };
  });
  expect(calls).toEqual(recipients.map((recipient) => recipient.phone));
  expect(result.deliveries).toEqual([
    { ...recipients[0], status: "sent", messageSid: "SM-First" },
    { ...recipients[2], status: "sent", messageSid: "SM-Third" },
  ]);
  expect(result.failures).toMatchObject([
    { ...recipients[1], status: "failed" },
  ]);
  const output = {
    status: "partial",
    deliveries: result.deliveries,
    failures: result.failures,
  };
  expect(JSON.stringify(output)).not.toContain("secret provider");
});

test("complete success and complete failure both retain an entry per recipient", async () => {
  const success = await collectSmsDeliveries(recipients, async ({ name }) => ({
    sid: `SM-${name}`,
  }));
  expect(success.deliveries).toHaveLength(3);
  expect(success.failures).toHaveLength(0);
  const failure = await collectSmsDeliveries(recipients, async () => {
    throw new Error("unavailable");
  });
  expect(failure.deliveries).toHaveLength(0);
  expect(failure.failures.map(({ phone }) => phone)).toEqual(
    recipients.map(({ phone }) => phone),
  );
});

test("runtime retains a structured partial failure and marks it non-retryable", async () => {
  const output = {
    status: "partial",
    deliveries: [{ ...recipients[0], messageSid: "SM-accepted" }],
    failures: [recipients[1]],
  };
  const definition = websiteLeadWorkflowSeed({ smsRecipients: recipients });
  const workflowEvent = {
    schemaVersion: 1 as const,
    id: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    type: "website.form.submitted" as const,
    objectType: "lead" as const,
    objectId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actor: { type: "system" as const },
    correlationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    payload: {},
  };
  let failure: WorkflowNodeExecutionError | undefined;
  try {
    await runWorkflowRuntime({
      definition,
      event: workflowEvent,
      execute: async ({ node }) => {
        if (node.type === "action.sendDirectSms")
          throw new WorkflowActionError("Partial SMS failure", output);
        return {};
      },
    });
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowNodeExecutionError);
    failure = error as WorkflowNodeExecutionError;
  }
  expect(failure?.output).toEqual(output);
  expect(failure?.retryable).toBe(false);
  expect(failure?.errorCode).toBe("ACTION_FAILED");
  expect(failure?.output).not.toBe(output);
});
