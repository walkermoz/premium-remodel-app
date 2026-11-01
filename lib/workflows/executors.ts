import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getBusinessConfigForOrganization } from "../business-config";
import { recordContactCommunication } from "../contact-communications";
import {
  configuredDiscordLeadWebhook,
  sendDiscordLeadNotification,
  sendDiscordWorkflowNotification,
} from "../discord-leads";
import { sendWebsiteLeadAcknowledgement } from "../lead-email";
import { renderLeadAcknowledgement } from "../email-template";
import { websiteLeadSmsBody } from "../lead-sms-copy";
import {
  applySmsComplianceEvent,
  sendCustomerSms,
  SmsConsentRequiredError,
  SmsDoNotDisturbError,
} from "../sms-compliance";
import { supabaseAdmin } from "../supabase/server";
import { organizationSecretValue } from "../organization-secrets";
import { isOriginalOrganization } from "../original-organization";
import { TwilioConnectionError } from "../twilio-client";
import {
  interpolateWorkflowJson,
  interpolateWorkflowText,
  resolveWorkflowOperand,
} from "./conditions";
import { workflowNodeDefinition } from "./registry";
import type {
  WorkflowContext,
  WorkflowEvent,
  WorkflowNode,
  WorkflowSettings,
} from "./schema";
import { assertPublicWorkflowWebhookUrl } from "./webhook-safety.server";
import {
  sendWorkflowEmail,
  WorkflowEmailUncertainError,
} from "./workflow-email";
import { enqueueWorkflowEvent } from "./events";
import { WorkflowConfigurationError } from "./runtime";

export type WorkflowExecutorInput = {
  organizationId: string;
  runId: string;
  node: WorkflowNode;
  event: WorkflowEvent;
  context: WorkflowContext;
  idempotencyKey: string;
  settings?: WorkflowSettings;
};

export type WorkflowExecutorResult = {
  status?: "completed" | "skipped";
  summary?: string;
  output?: Record<string, unknown>;
  providerId?: string;
};

type Handler = (
  input: WorkflowExecutorInput,
) => Promise<WorkflowExecutorResult>;

function assertOrganizationSender(
  input: WorkflowExecutorInput,
  channel: "email" | "sms",
) {
  const connectionId =
    channel === "email"
      ? input.settings?.senderDefaults.emailConnectionId
      : input.settings?.senderDefaults.smsConnectionId;
  if (connectionId && connectionId !== input.organizationId)
    throw new Error(
      `The selected ${channel === "email" ? "email" : "text"} sender does not belong to this organization.`,
    );
}

function deterministicUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mappedFields(node: WorkflowNode, context: WorkflowContext) {
  const fields = (node.config.fields || {}) as Record<
    string,
    Parameters<typeof resolveWorkflowOperand>[1]
  >;
  return Object.fromEntries(
    Object.entries(fields).map(([key, operand]) => [
      key,
      resolveWorkflowOperand(context, operand),
    ]),
  );
}

function operandString(
  context: WorkflowContext,
  value: unknown,
  label: string,
) {
  const resolved = resolveWorkflowOperand(
    context,
    value as Parameters<typeof resolveWorkflowOperand>[1],
  );
  if (typeof resolved !== "string" || !resolved.trim())
    throw new Error(`${label} is missing.`);
  return resolved.trim();
}

function operandOptionalString(context: WorkflowContext, value: unknown) {
  const resolved = resolveWorkflowOperand(
    context,
    value as Parameters<typeof resolveWorkflowOperand>[1],
  );
  return typeof resolved === "string" ? resolved.trim() : "";
}

async function storedRecord(organizationId: string, kind: string, id: string) {
  const result = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.data as Record<string, unknown> | undefined;
}

function outputRecordId(context: WorkflowContext, alias: string) {
  const output = context.outputs?.[alias];
  if (!output) return null;
  if (typeof output.id === "string") return output.id;
  if (
    output.record &&
    typeof output.record === "object" &&
    typeof (output.record as Record<string, unknown>).id === "string"
  )
    return String((output.record as Record<string, unknown>).id);
  return null;
}

async function recordWebsiteLeadDelivery(
  input: WorkflowExecutorInput,
  legacyField: "emailAcknowledgement" | "smsAcknowledgement" | "discordNotification",
  value: Record<string, unknown>,
) {
  const tracking = input.node.config.resultTracking as
    | {
        objectType?: unknown;
        objectId?: unknown;
        field?: unknown;
      }
    | undefined;
  const kind = tracking
    ? String(tracking.objectType || "").replace("item", "task")
    : legacyField
      ? "lead"
      : "";
  const id = tracking
    ? operandOptionalString(input.context, tracking.objectId)
    : outputRecordId(input.context, "leadResult") || input.event.objectId;
  const field = tracking ? String(tracking.field || "") : legacyField || "";
  if (
    !["contact", "lead", "quote", "project", "task"].includes(kind) ||
    !id ||
    !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(field)
  )
    return;
  const record = await storedRecord(input.organizationId, kind, id);
  if (!record) return;
  const updatedAt = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_records")
    .update({
      data: { ...record, [field]: value, updatedAt },
      updated_at: updatedAt,
    })
    .eq("organization_id", input.organizationId)
    .eq("kind", kind)
    .eq("id", id);
  if (result.error)
    console.error(`Could not store ${field} on workflow ${kind} ${id}.`);
}

async function insertObject(
  input: WorkflowExecutorInput,
  kind: string,
  fields = mappedFields(input.node, input.context),
) {
  const now = new Date().toISOString();
  const eventOwnsObject =
    input.event.objectType === (kind === "task" ? "item" : kind) &&
    /^[0-9a-f-]{36}$/i.test(input.event.objectId);
  const id =
    typeof fields.id === "string" && /^[0-9a-f-]{36}$/i.test(fields.id)
      ? fields.id
      : eventOwnsObject
        ? input.event.objectId
        : deterministicUuid(input.idempotencyKey);
  const existing = await storedRecord(input.organizationId, kind, id);
  if (existing) return { record: existing, id, created: false };
  const record = {
    ...fields,
    id,
    createdAt: typeof fields.createdAt === "string" ? fields.createdAt : now,
    updatedAt: now,
  };
  const saved = await supabaseAdmin()
    .from("remodel_records")
    .insert({
      id,
      organization_id: input.organizationId,
      kind,
      project_id:
        typeof fields.projectId === "string" ? fields.projectId : null,
      data: record,
      updated_at: now,
    });
  if (saved.error) {
    if (saved.error.code === "23505") {
      const raced = await storedRecord(input.organizationId, kind, id);
      if (raced) return { record: raced, id, created: false };
    }
    throw saved.error;
  }
  return { record, id, created: true };
}

async function emitCreatedObjectEvent(
  input: WorkflowExecutorInput,
  kind: "contact" | "lead" | "quote" | "project" | "task",
  id: string,
  record: Record<string, unknown>,
) {
  const eventType = {
    contact: "contact.created",
    lead: "lead.created",
    quote: "quote.created",
    project: "project.created",
    task: "item.created",
  } as const;
  const objectType = kind === "task" ? "item" : kind;
  const contactId =
    kind === "contact"
      ? id
      : typeof record.contactId === "string"
        ? record.contactId
        : undefined;
  await enqueueWorkflowEvent({
    organizationId: input.organizationId,
    type: eventType[kind],
    objectType,
    objectId: id,
    ...(contactId ? { contactId } : {}),
    actor: { type: "system", id: input.runId, name: "Workflow" },
    correlationId: input.event.correlationId,
    causationId: input.event.id,
    idempotencyKey: `workflow-created:${input.idempotencyKey}`,
    payload: { recordId: id, contactId: contactId || null },
  });
}

function recordChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ]) {
    if (Object.keys(changes).length >= 100) break;
    if (!isDeepStrictEqual(before[key], after[key]))
      changes[key] = { from: before[key], to: after[key] };
  }
  return changes;
}

async function emitUpdatedObjectEvents(
  input: WorkflowExecutorInput,
  kind: string,
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const changes = recordChanges(before, after);
  const events: Array<{
    type: WorkflowEvent["type"];
    objectType: WorkflowEvent["objectType"];
  }> = [];
  if (kind === "contact" && Object.keys(changes).length)
    events.push({ type: "contact.updated", objectType: "contact" });
  if (kind === "lead" && before.status !== after.status)
    events.push({ type: "lead.stage.changed", objectType: "lead" });
  if (kind === "lead" && before.disposition !== after.disposition)
    events.push({ type: "lead.disposition.changed", objectType: "lead" });
  if (
    kind === "quote" &&
    before.status !== after.status &&
    after.status === "Sent"
  )
    events.push({ type: "quote.sent", objectType: "quote" });
  if (
    kind === "quote" &&
    before.status !== after.status &&
    after.status === "Declined"
  )
    events.push({ type: "quote.declined", objectType: "quote" });
  if (kind === "project" && before.status !== after.status)
    events.push({ type: "project.status.changed", objectType: "project" });
  if (kind === "task" && before.contractorId !== after.contractorId)
    events.push({ type: "item.assigned", objectType: "item" });
  if (kind === "task" && before.status !== "Done" && after.status === "Done")
    events.push({ type: "item.completed", objectType: "item" });

  const contactId =
    kind === "contact"
      ? id
      : typeof after.contactId === "string"
        ? after.contactId
        : undefined;
  for (const event of events)
    await enqueueWorkflowEvent({
      organizationId: input.organizationId,
      type: event.type,
      objectType: event.objectType,
      objectId: id,
      ...(contactId ? { contactId } : {}),
      actor: { type: "system", id: input.runId, name: "Workflow" },
      correlationId: input.event.correlationId,
      causationId: input.event.id,
      idempotencyKey: `workflow-updated:${input.idempotencyKey}:${event.type}`,
      payload: {
        recordId: id,
        changes,
        status: after.status || "",
        disposition: after.disposition || "",
        contactId: contactId || null,
        projectId: after.projectId || null,
        contractorId: after.contractorId || null,
      },
    });
}

async function findContact(input: WorkflowExecutorInput) {
  const email = input.node.config.email
    ? operandOptionalString(
        input.context,
        input.node.config.email,
      ).toLocaleLowerCase()
    : "";
  const phone = input.node.config.phone
    ? operandOptionalString(input.context, input.node.config.phone)
    : "";
  const id = input.node.config.id
    ? operandOptionalString(input.context, input.node.config.id)
    : "";
  const admin = supabaseAdmin();
  const matchMode = String(input.node.config.multipleMatch || "latest");
  const choose = (
    rows: Array<{ data: unknown }>,
  ): { contact?: Record<string, unknown>; found: boolean } => {
    if (matchMode === "fail" && rows.length > 1)
      throw new Error(
        "More than one Contact matched. Refine the matching fields.",
      );
    const selected = rows[0]?.data as Record<string, unknown> | undefined;
    return selected ? { contact: selected, found: true } : { found: false };
  };
  if (id) {
    const record = await storedRecord(input.organizationId, "contact", id);
    return record ? { contact: record, found: true } : { found: false };
  }
  if (email) {
    const result = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", input.organizationId)
      .eq("kind", "contact")
      .ilike("data->>email", email)
      .order("updated_at", { ascending: matchMode === "earliest" })
      .limit(matchMode === "fail" ? 2 : 1);
    if (result.error) throw result.error;
    const selected = choose(result.data || []);
    if (selected.found) return selected;
  }
  if (phone) {
    const result = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", input.organizationId)
      .eq("kind", "contact")
      .eq("data->>phone", phone)
      .order("updated_at", { ascending: matchMode === "earliest" })
      .limit(matchMode === "fail" ? 2 : 1);
    if (result.error) throw result.error;
    const selected = choose(result.data || []);
    if (selected.found) return selected;
  }
  return { found: false };
}

const handlers = new Map<string, Handler>();

handlers.set("contact.find", async (input) => ({
  output: await findContact(input),
}));

handlers.set("contact.findOrCreate", async (input) => {
  if (input.node.config.matchExisting === false) {
    const created = await insertObject(input, "contact");
    if (
      created.created ||
      created.id === deterministicUuid(input.idempotencyKey)
    )
      await emitCreatedObjectEvent(
        input,
        "contact",
        created.id,
        created.record,
      );
    return {
      output: { contact: created.record, created: true, reused: false },
    };
  }
  const fields = mappedFields(input.node, input.context);
  const now = new Date().toISOString();
  const contact = {
    ...fields,
    id: deterministicUuid(input.idempotencyKey),
    createdAt: now,
    updatedAt: now,
  };
  const result = await supabaseAdmin().rpc(
    "remodel_workflow_find_or_create_contact",
    {
      p_organization_id: input.organizationId,
      p_contact: contact,
      p_match_existing: true,
      p_created_by: null,
    },
  );
  if (result.error) throw result.error;
  const output = result.data as Record<string, unknown>;
  if (
    output.contact &&
    typeof output.contact === "object" &&
    (output.created === true ||
      (output.contact as Record<string, unknown>).id ===
        deterministicUuid(input.idempotencyKey))
  )
    await emitCreatedObjectEvent(
      input,
      "contact",
      String((output.contact as Record<string, unknown>).id),
      output.contact as Record<string, unknown>,
    );
  return { output };
});

for (const [executor, kind] of [
  ["contact.create", "contact"],
  ["lead.create", "lead"],
  ["item.create", "task"],
] as const)
  handlers.set(executor, async (input) => {
    const created = await insertObject(input, kind);
    if (
      created.created ||
      created.id === deterministicUuid(input.idempotencyKey)
    )
      await emitCreatedObjectEvent(input, kind, created.id, created.record);
    return {
      status: "completed",
      summary: created.created
        ? `Created ${kind}.`
        : `Reused existing ${kind}.`,
      output: {
        record: created.record,
        id: created.id,
        created: created.created,
      },
    };
  });

handlers.set("project.createFromQuote", async (input) => {
  const quoteId = operandString(
    input.context,
    input.node.config.quoteId,
    "Quote ID",
  );
  const quote = await storedRecord(input.organizationId, "quote", quoteId);
  if (!quote) throw new Error(`quote ${quoteId} was not found.`);
  const fields = {
    quoteId,
    contactId: quote.contactId || null,
    leadId: quote.leadId || null,
    name: quote.name || quote.title || "Project from Quote",
    address: quote.address || "",
    status: "Planning",
    ...mappedFields(input.node, input.context),
  };
  const created = await insertObject(input, "project", fields);
  if (created.created || created.id === deterministicUuid(input.idempotencyKey))
    await emitCreatedObjectEvent(input, "project", created.id, created.record);
  return {
    summary: created.created
      ? "Created a Project from the Quote."
      : "Reused the Project previously created from the Quote.",
    output: {
      record: created.record,
      id: created.id,
      created: created.created,
      quoteId,
    },
  };
});

handlers.set("quote.upsert", async (input) => {
  const fields = mappedFields(input.node, input.context);
  const configuredId = input.node.config.objectId
    ? operandOptionalString(input.context, input.node.config.objectId)
    : typeof fields.id === "string"
      ? fields.id
      : "";
  if (configuredId) {
    const current = await storedRecord(
      input.organizationId,
      "quote",
      configuredId,
    );
    if (current) {
      const updatedAt = new Date().toISOString();
      const record = { ...current, ...fields, id: configuredId, updatedAt };
      const saved = await supabaseAdmin()
        .from("remodel_records")
        .update({ data: record, updated_at: updatedAt })
        .eq("organization_id", input.organizationId)
        .eq("kind", "quote")
        .eq("id", configuredId);
      if (saved.error) throw saved.error;
      await emitUpdatedObjectEvents(
        input,
        "quote",
        configuredId,
        current,
        record,
      );
      return {
        summary: "Updated quote.",
        output: { record, id: configuredId, created: false },
      };
    }
  }
  const created = await insertObject(input, "quote", fields);
  if (created.created || created.id === deterministicUuid(input.idempotencyKey))
    await emitCreatedObjectEvent(input, "quote", created.id, created.record);
  return {
    summary: created.created ? "Created quote." : "Reused existing quote.",
    output: {
      record: created.record,
      id: created.id,
      created: created.created,
    },
  };
});

async function updateObject(input: WorkflowExecutorInput) {
  const kind = String(
    input.node.config.objectType ||
      (input.node.type === "action.updateContact" ? "contact" : "lead"),
  ).replace("item", "task");
  const id = operandString(
    input.context,
    input.node.config.objectId,
    `${kind} ID`,
  );
  const current = await storedRecord(input.organizationId, kind, id);
  if (!current) throw new Error(`${kind} ${id} was not found.`);
  const updatedAt = new Date().toISOString();
  const record = {
    ...current,
    ...mappedFields(input.node, input.context),
    id,
    updatedAt,
  };
  const result = await supabaseAdmin()
    .from("remodel_records")
    .update({ data: record, updated_at: updatedAt })
    .eq("organization_id", input.organizationId)
    .eq("kind", kind)
    .eq("id", id);
  if (result.error) throw result.error;
  await emitUpdatedObjectEvents(input, kind, id, current, record);
  return { output: { record, id } };
}

handlers.set("contact.update", updateObject);
handlers.set("lead.update", updateObject);
handlers.set("object.update", updateObject);
handlers.set("object.assignUser", async (input) => {
  const fields = {
    assignedUserId: input.node.config.userId,
  };
  return updateObject({
    ...input,
    node: { ...input.node, config: { ...input.node.config, fields } },
  });
});

handlers.set("object.addNote", async (input) => {
  const objectType = String(
    input.node.config.objectType || input.event.objectType,
  );
  const objectId = operandString(
    input.context,
    input.node.config.objectId,
    "Object ID",
  );
  const body = interpolateWorkflowText(
    String(input.node.config.body || ""),
    input.context,
    {
      missing: "error",
    },
  ).value;
  const result = await supabaseAdmin()
    .from("remodel_workflow_object_notes")
    .upsert(
      {
        id: deterministicUuid(input.idempotencyKey),
        organization_id: input.organizationId,
        object_type: objectType,
        object_id: objectId,
        body,
        run_id: input.runId,
        node_id: input.node.id,
        idempotency_key: input.idempotencyKey,
      },
      { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true },
    );
  if (result.error) throw result.error;
  return {
    summary: `Added a note to ${objectType}.`,
    output: {
      id: deterministicUuid(input.idempotencyKey),
      objectType,
      objectId,
    },
  };
});

handlers.set("communication.sendEmail", async (input) => {
  assertOrganizationSender(input, "email");
  const tracksDelivery =
    Boolean(input.node.config.resultTracking) ||
    input.node.config.templateKey === "website-lead-acknowledgement";
  if (input.node.config.enabled === false) {
    if (tracksDelivery)
      await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
        status: "skipped",
        attemptedAt: new Date().toISOString(),
        detail: "Disabled by automation",
      });
    return { status: "skipped", summary: "Email action is disabled." };
  }
  const recipient = operandString(
    input.context,
    input.node.config.recipient,
    "Email recipient",
  );
  const missing = String(input.node.config.missingValueBehavior || "skip") as
    "blank" | "fallback" | "skip" | "error";
  const subject = interpolateWorkflowText(
    String(input.node.config.subject || ""),
    input.context,
    {
      missing,
      fallback: String(input.node.config.fallbackValue || ""),
    },
  );
  const body = interpolateWorkflowText(
    String(input.node.config.body || ""),
    input.context,
    {
      missing,
      fallback: String(input.node.config.fallbackValue || ""),
    },
  );
  if (subject.skipped || body.skipped) {
    if (tracksDelivery)
      await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
        status: "skipped",
        attemptedAt: new Date().toISOString(),
        detail: "A required workflow value was missing",
      });
    return {
      status: "skipped",
      summary: "Email skipped because a required value is missing.",
    };
  }
  const contactId =
    typeof input.context.contact?.id === "string"
      ? input.context.contact.id
      : input.event.contactId;
  if (input.node.config.templateKey === "website-lead-acknowledgement") {
    const sent = await sendWebsiteLeadAcknowledgement({
      organizationId: input.organizationId,
      recipientEmail: recipient,
      firstName: String(input.event.payload.firstName || ""),
    });
    if (sent.status === "failed") {
      await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
        ...sent,
      });
      throw new Error(sent.detail || "Website lead email delivery failed.");
    }
    if (sent.status === "not_configured") {
      await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
        ...sent,
      });
      throw new WorkflowConfigurationError(
        "Connect the company Google mailbox before this email action can run.",
      );
    }
    if (sent.status === "sent" && contactId) {
      const businessConfig = await getBusinessConfigForOrganization(
        input.organizationId,
      );
      const leadId =
        typeof input.context.outputs?.leadResult === "object" &&
        input.context.outputs.leadResult &&
        typeof (input.context.outputs.leadResult as Record<string, unknown>)
          .id === "string"
          ? String(
              (input.context.outputs.leadResult as Record<string, unknown>).id,
            )
          : input.event.objectId;
      const firstName = String(input.event.payload.firstName || "");
      await recordContactCommunication({
        organizationId: input.organizationId,
        contactId,
        channel: "email",
        recipient,
        subject: "We received your remodel request",
        body: renderLeadAcknowledgement({
          firstName,
          business: {
            name: businessConfig.profile.name,
            website: businessConfig.profile.website,
            email: businessConfig.profile.email,
            phone: businessConfig.profile.phone,
          },
        }).text,
        relatedKind: "lead",
        relatedId: leadId,
        ...(sent.googleMessageId ? { providerId: sent.googleMessageId } : {}),
        dedupeKey: sent.googleMessageId
          ? `gmail:${sent.googleMessageId}`
          : input.idempotencyKey,
        sentAt: sent.attemptedAt,
      });
    }
    await recordWebsiteLeadDelivery(input, "emailAcknowledgement", { ...sent });
    return {
      status:
        sent.status === "sent" || sent.status === "unknown"
          ? "completed"
          : "skipped",
      summary:
        sent.status === "sent"
          ? `Email sent to ${recipient}.`
          : sent.status === "unknown"
            ? "Email delivery could not be confirmed; it will not be resent automatically."
            : sent.detail || "Company email is not connected.",
      output: sent,
      providerId: sent.googleMessageId,
    };
  }
  let sent: Awaited<ReturnType<typeof sendWorkflowEmail>>;
  try {
    sent = await sendWorkflowEmail({
      organizationId: input.organizationId,
      recipient,
      subject: subject.value,
      body: body.value,
      presentation:
        input.node.config.presentation === "business" ? "business" : "plain",
      ...(contactId ? { contactId } : {}),
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof WorkflowEmailUncertainError) {
      if (tracksDelivery)
        await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
          status: "unknown",
          attemptedAt: new Date().toISOString(),
          detail: error.message,
        });
      return {
        summary: error.message,
        output: { status: "unknown", retrySuppressed: true },
      };
    }
    if (
      error instanceof Error &&
      error.message ===
        "Connect the company Google mailbox before sending email."
    ) {
      if (tracksDelivery)
        await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
          status: "not_configured",
          attemptedAt: new Date().toISOString(),
          detail: error.message,
        });
      throw new WorkflowConfigurationError(error.message);
    }
    if (tracksDelivery)
      await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
        status: "failed",
        attemptedAt: new Date().toISOString(),
        detail: error instanceof Error ? error.message : "Email failed",
      });
    throw error;
  }
  if (tracksDelivery)
    await recordWebsiteLeadDelivery(input, "emailAcknowledgement", {
      status: "sent",
      attemptedAt: new Date().toISOString(),
      ...(sent.messageId ? { googleMessageId: sent.messageId } : {}),
    });
  return {
    summary: `Email sent to ${recipient}.`,
    output: sent,
    providerId: sent.messageId,
  };
});

handlers.set("policy.sms", async () => ({
  summary:
    "SMS consent, recipient ownership, DND, and company-number policy will be enforced at send time.",
  output: { required: true },
}));

handlers.set("communication.sendSms", async (input) => {
  assertOrganizationSender(input, "sms");
  const tracksDelivery =
    Boolean(input.node.config.resultTracking) ||
    input.node.config.templateKey === "website-lead-acknowledgement";
  if (input.node.config.enabled === false) {
    if (tracksDelivery)
      await recordWebsiteLeadDelivery(input, "smsAcknowledgement", {
        status: "skipped",
        attemptedAt: new Date().toISOString(),
        detail: "Disabled by automation",
      });
    return { status: "skipped", summary: "SMS action is disabled." };
  }
  const recipient = operandString(
    input.context,
    input.node.config.recipient,
    "SMS recipient",
  );
  const contactId = operandString(
    input.context,
    input.node.config.contactId,
    "Contact ID",
  );
  const missing = String(input.node.config.missingValueBehavior || "skip") as
    "blank" | "fallback" | "skip" | "error";
  let body: string;
  if (input.node.config.templateKey === "website-lead-acknowledgement") {
    const business = await getBusinessConfigForOrganization(
      input.organizationId,
    );
    body = websiteLeadSmsBody(
      business.profile.name,
      String(input.event.payload.project || ""),
    );
  } else {
    const rendered = interpolateWorkflowText(
      String(input.node.config.body || ""),
      input.context,
      {
        missing,
        fallback: String(input.node.config.fallbackValue || ""),
      },
    );
    if (rendered.skipped) {
      if (tracksDelivery)
        await recordWebsiteLeadDelivery(input, "smsAcknowledgement", {
          status: "skipped",
          attemptedAt: new Date().toISOString(),
          detail: "A required workflow value was missing",
        });
      return {
        status: "skipped",
        summary: "SMS skipped because a required value is missing.",
      };
    }
    body = rendered.value;
  }
  let sent: Awaited<ReturnType<typeof sendCustomerSms>>;
  try {
    sent = await sendCustomerSms(input.organizationId, {
      contactId,
      to: recipient,
      body,
      category:
        input.node.config.category === "marketing"
          ? "marketing"
          : "appointment",
    });
  } catch (error) {
    if (error instanceof TwilioConnectionError) {
      if (tracksDelivery)
        await recordWebsiteLeadDelivery(input, "smsAcknowledgement", {
          status: "not_configured",
          attemptedAt: new Date().toISOString(),
          detail: error.message,
        });
      throw new WorkflowConfigurationError(error.message);
    }
    if (
      error instanceof SmsConsentRequiredError ||
      error instanceof SmsDoNotDisturbError
    ) {
      if (tracksDelivery)
        await recordWebsiteLeadDelivery(input, "smsAcknowledgement", {
          status: "skipped",
          attemptedAt: new Date().toISOString(),
          detail: error.message,
        });
      return {
        status: "skipped",
        summary: error.message,
        output: { status: "skipped", reason: error.message },
      };
    }
    if (tracksDelivery)
      await recordWebsiteLeadDelivery(input, "smsAcknowledgement", {
        status: "unknown",
        attemptedAt: new Date().toISOString(),
        detail: "Delivery could not be confirmed",
      });
    return {
      summary:
        "SMS delivery could not be confirmed; it will not be resent automatically.",
      output: { status: "unknown", retrySuppressed: true },
    };
  }
  if (tracksDelivery)
    await recordWebsiteLeadDelivery(input, "smsAcknowledgement", {
      status: "sent",
      attemptedAt: new Date().toISOString(),
      twilioMessageSid: sent.sid,
    });
  return {
    summary: `SMS sent to ${recipient}.`,
    output: { status: "sent", messageSid: sent.sid },
    providerId: sent.sid,
  };
});

handlers.set("communication.internalNotification", async (input) => {
  if (input.node.config.enabled === false) {
    if (input.node.config.templateKey === "website-lead-team-notification")
      await recordWebsiteLeadDelivery(input, "discordNotification", {
        status: "skipped",
        attemptedAt: new Date().toISOString(),
        detail: "Disabled by automation",
      });
    return { status: "skipped", summary: "Internal notification is disabled." };
  }
  const title = interpolateWorkflowText(
    String(input.node.config.title || ""),
    input.context,
  ).value;
  const body = interpolateWorkflowText(
    String(input.node.config.body || ""),
    input.context,
  ).value;
  const result =
    input.node.config.templateKey === "website-lead-team-notification"
      ? await sendDiscordLeadNotification({
          first_name: String(input.event.payload.firstName || ""),
          last_name: String(input.event.payload.lastName || ""),
          email: String(input.event.payload.email || ""),
          phone: String(input.event.payload.phone || ""),
          zip: String(input.event.payload.zip || ""),
          address: String(input.event.payload.address || ""),
          project: String(input.event.payload.project || ""),
          project_description: String(input.event.payload.description || ""),
        })
      : await sendDiscordWorkflowNotification({ title, body });
  if (input.node.config.templateKey === "website-lead-team-notification")
    await recordWebsiteLeadDelivery(input, "discordNotification", {
      ...result,
    });
  if (result.status === "not_configured")
    throw new WorkflowConfigurationError(
      result.detail || "Connect the team notification destination before this action can run.",
    );
  return {
    status: result.status === "sent" ? "completed" : "skipped",
    summary:
      result.status === "sent"
        ? "Team notification sent."
        : result.detail || "Team channel is not configured.",
    output: { ...result },
  };
});

handlers.set("integration.webhook", async (input) => {
  const websiteLeadRequest =
    Boolean(input.node.config.resultTracking) ||
    input.node.config.templateKey === "website-lead-team-notification";
  const attemptedAt = new Date().toISOString();
  if (input.node.config.enabled === false) {
    if (websiteLeadRequest)
      await recordWebsiteLeadDelivery(input, "discordNotification", {
        status: "skipped",
        attemptedAt,
        detail: "Disabled by automation",
      });
    return { status: "skipped", summary: "HTTPS request is disabled." };
  }

  const destination = String(input.node.config.destination || "custom");
  const configuredUrl =
    destination === "discord_lead_webhook"
      ? isOriginalOrganization(input.organizationId)
        ? configuredDiscordLeadWebhook()
        : ""
      : input.node.config.urlSecretId
        ? await organizationSecretValue(
            input.organizationId,
            String(input.node.config.urlSecretId),
          )
        : String(input.node.config.url || "");
  if (!configuredUrl) {
    if (websiteLeadRequest)
      await recordWebsiteLeadDelivery(input, "discordNotification", {
        status: "not_configured",
        attemptedAt,
        detail: "The lead-notification HTTPS destination is not connected",
      });
    throw new WorkflowConfigurationError(
      "Configure the selected HTTPS destination before this action can run.",
    );
  }

  const url = await assertPublicWorkflowWebhookUrl(configuredUrl);
  const missing =
    input.node.config.missingValueBehavior === "fallback" ||
    input.node.config.missingValueBehavior === "skip" ||
    input.node.config.missingValueBehavior === "error"
      ? input.node.config.missingValueBehavior
      : "blank";
  const bodyType = input.node.config.bodyType === "text" ? "text" : "json";
  const bodyTemplate = String(input.node.config.body || "");
  const rendered =
    bodyType === "json" && bodyTemplate.trim()
      ? interpolateWorkflowJson(bodyTemplate, input.context, {
          missing,
          fallback:
            typeof input.node.config.fallbackValue === "string"
              ? input.node.config.fallbackValue
              : undefined,
        })
      : interpolateWorkflowText(bodyTemplate, input.context, {
          missing,
          fallback:
            typeof input.node.config.fallbackValue === "string"
              ? input.node.config.fallbackValue
              : undefined,
        });
  if (rendered.skipped) {
    if (websiteLeadRequest)
      await recordWebsiteLeadDelivery(input, "discordNotification", {
        status: "skipped",
        attemptedAt,
        detail: "A required workflow value was missing",
      });
    return {
      status: "skipped",
      summary: "HTTPS request skipped because a required value is missing.",
    };
  }

  const secretHeaderEntries = await Promise.all(
    Object.entries(
      (input.node.config.secretHeaders || {}) as Record<string, string>,
    ).map(
      async ([name, secretId]) =>
        [
          name,
          await organizationSecretValue(input.organizationId, secretId),
        ] as const,
    ),
  );
  const response = await fetch(url, {
    method: String(input.node.config.method || "POST"),
    headers: {
      "Content-Type":
        bodyType === "json" ? "application/json" : "text/plain; charset=utf-8",
      ...((input.node.config.headers || {}) as Record<string, string>),
      ...Object.fromEntries(secretHeaderEntries),
      "Idempotency-Key": input.idempotencyKey,
    },
    body: input.node.config.method === "GET" ? undefined : rendered.value,
    redirect: "manual",
    signal: AbortSignal.timeout(
      Math.min(
        30,
        Math.max(1, Number(input.node.config.timeoutSeconds) || 15),
      ) * 1_000,
    ),
  });
  if (response.status >= 300 && response.status < 400)
    throw new Error("Webhook redirects are not allowed.");
  if (!response.ok)
    throw new Error(`Webhook returned HTTP ${response.status}.`);
  const responseText = input.node.config.saveResponse
    ? (await response.text()).slice(0, 50_000)
    : "";
  if (websiteLeadRequest)
    await recordWebsiteLeadDelivery(input, "discordNotification", {
      status: "sent",
      attemptedAt,
      detail: `HTTPS ${response.status}`,
    });
  return {
    summary: `Webhook returned HTTP ${response.status}.`,
    output: {
      status: response.status,
      ...(responseText ? { response: responseText } : {}),
    },
  };
});

handlers.set("policy.applySmsCompliance", async (input) => {
  const eventType = String(input.node.config.eventType) as
    "help" | "stop" | "start";
  const applied = await applySmsComplianceEvent({
    organizationId: input.organizationId,
    sender: String(input.event.payload.to || ""),
    phone: String(input.event.payload.from || ""),
    eventType,
    messageSid: String(input.event.payload.messageSid || input.event.objectId),
  });
  return {
    summary: applied
      ? `${eventType.toUpperCase()} recorded.`
      : `${eventType.toUpperCase()} was already recorded.`,
    output: { applied, eventType },
  };
});

handlers.set("workflow.enroll", async (input) => {
  const workflowId = String(input.node.config.workflowId || "");
  const objectId = input.node.config.objectId
    ? operandString(
        input.context,
        input.node.config.objectId,
        "Enrollment object ID",
      )
    : input.event.objectId;
  const eventId = deterministicUuid(`event:${input.idempotencyKey}`);
  const result = await supabaseAdmin().rpc("remodel_enqueue_workflow_event", {
    p_event_id: eventId,
    p_organization_id: input.organizationId,
    p_schema_version: 1,
    p_event_type: "workflow.manual",
    p_actor: { type: "system", id: input.runId, name: "Workflow" },
    p_object_type: input.event.objectType,
    p_object_id: objectId,
    p_contact_id: input.event.contactId || null,
    p_occurred_at: new Date().toISOString(),
    p_correlation_id: input.event.correlationId,
    p_causation_id: input.event.id,
    p_idempotency_key: `workflow-enroll:${input.idempotencyKey}`,
    p_payload: { targetWorkflowId: workflowId, sourceRunId: input.runId },
  });
  if (result.error) throw result.error;
  return {
    summary: "Queued enrollment in the selected workflow.",
    output: { workflowId, eventId: result.data?.eventId || eventId },
  };
});

handlers.set("workflow.remove", async (input) => {
  const workflowId = String(input.node.config.workflowId || "");
  const objectId = input.node.config.objectId
    ? operandString(
        input.context,
        input.node.config.objectId,
        "Enrollment object ID",
      )
    : input.event.objectId;
  const admin = supabaseAdmin();
  const enrollments = await admin
    .from("remodel_workflow_enrollments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("organization_id", input.organizationId)
    .eq("workflow_id", workflowId)
    .eq("object_id", objectId)
    .eq("status", "active")
    .select("id");
  if (enrollments.error) throw enrollments.error;
  const enrollmentIds = (enrollments.data || []).map((item) => item.id);
  if (enrollmentIds.length) {
    const runs = await admin
      .from("remodel_workflow_runs")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("organization_id", input.organizationId)
      .in("enrollment_id", enrollmentIds)
      .in("status", ["queued", "running", "waiting"])
      .select("id");
    if (runs.error) throw runs.error;
    const runIds = (runs.data || []).map((item) => item.id);
    if (runIds.length) {
      const waits = await admin
        .from("remodel_workflow_waits")
        .update({ status: "cancelled" })
        .eq("organization_id", input.organizationId)
        .in("run_id", runIds)
        .eq("status", "waiting");
      if (waits.error) throw waits.error;
    }
  }
  return {
    summary: `Removed ${enrollmentIds.length} active enrollment${enrollmentIds.length === 1 ? "" : "s"}.`,
    output: { workflowId, objectId, removed: enrollmentIds.length },
  };
});

handlers.set("control.goto", async () => ({
  summary: "Continued at the linked step.",
}));

export async function executeWorkflowNode(input: WorkflowExecutorInput) {
  const definition = workflowNodeDefinition(input.node.type);
  if (!definition)
    throw new Error(`Node type ${input.node.type} is not registered.`);
  const parsedInput = definition.inputSchema.safeParse({
    organizationId: input.organizationId,
    runId: input.runId,
    nodeId: input.node.id,
    idempotencyKey: input.idempotencyKey,
    event: input.event,
    context: input.context,
  });
  if (!parsedInput.success)
    throw new Error(
      `${definition.name} received invalid execution input: ${parsedInput.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  const handler = handlers.get(definition.executor);
  if (!handler)
    throw new Error(
      `${definition.name} is registered but its executor is not available yet.`,
    );
  const validateOutput = (result: WorkflowExecutorResult) => {
    const parsed = definition.outputSchema.safeParse(result.output || {});
    if (!parsed.success)
      throw new Error(
        `${definition.name} returned invalid output: ${parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    return { ...result, output: parsed.data as Record<string, unknown> };
  };
  if (!definition.sideEffect) return validateOutput(await handler(input));
  const claim = await supabaseAdmin().rpc("remodel_claim_workflow_effect", {
    p_organization_id: input.organizationId,
    p_idempotency_key: input.idempotencyKey,
    p_run_id: input.runId,
    p_node_id: input.node.id,
    p_effect_type: definition.executor,
  });
  if (claim.error) throw claim.error;
  if (claim.data?.status === "completed")
    return {
      status: "completed" as const,
      summary: "Reused the previously completed action.",
      output: (claim.data.result || {}) as Record<string, unknown>,
      providerId: claim.data.providerId || undefined,
    };
  if (claim.data?.claimed !== true)
    throw new Error("This workflow action is already being processed.");
  try {
    const result = validateOutput(await handler(input));
    const completed = await supabaseAdmin()
      .from("remodel_workflow_effects")
      .update({
        status: "completed",
        provider_id: result.providerId || null,
        result: result.output || {},
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("organization_id", input.organizationId)
      .eq("idempotency_key", input.idempotencyKey)
      .eq("status", "claimed");
    if (completed.error) throw completed.error;
    return result;
  } catch (error) {
    await supabaseAdmin()
      .from("remodel_workflow_effects")
      .update({
        status: "failed",
        last_error:
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : "Unknown action error",
      })
      .eq("organization_id", input.organizationId)
      .eq("idempotency_key", input.idempotencyKey)
      .eq("status", "claimed");
    throw error;
  }
}
