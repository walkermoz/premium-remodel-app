import "server-only";

import type { WorkspaceUser } from "./auth";
import { HttpError } from "./auth";
import { getBusinessConfigForOrganization } from "./business-config";
import { paymentProviderAdapter } from "./payment-providers";
import {
  quoteFlowConditionsMatch,
  quoteFlowDefinitionSchema,
  type QuoteFlowBlock,
  type QuoteFlowCondition,
  type QuoteFlowDefinition,
} from "./quote-flow-schema";
import { signatureStrokesSchema } from "./quote-signature";
import { publishedQuoteFlowVersion } from "./quote-flow-templates";
import { supabaseAdmin } from "./supabase/server";
import { enqueueWorkflowEvent } from "./workflows/events";

type FlowInstanceRow = {
  id: string;
  organization_id: string;
  quote_id: string;
  template_id: string;
  template_version: number;
  status: "active" | "completed" | "cancelled";
  current_stage_id: string;
  definition_snapshot: unknown;
  context_snapshot: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
};

const instanceColumns = [
  "id",
  "organization_id",
  "quote_id",
  "template_id",
  "template_version",
  "status",
  "current_stage_id",
  "definition_snapshot",
  "context_snapshot",
  "created_at",
  "updated_at",
  "completed_at",
  "cancelled_at",
  "created_by",
].join(",");

function instanceDto(
  row: FlowInstanceRow,
  values: unknown[] = [],
  events: unknown[] = [],
) {
  return {
    id: row.id,
    quoteId: row.quote_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    status: row.status,
    currentStageId: row.current_stage_id,
    definition: quoteFlowDefinitionSchema.parse(row.definition_snapshot),
    context: row.context_snapshot,
    values,
    events,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
  };
}

export function withoutStaffOnlyQuoteFlowContent<
  T extends ReturnType<typeof instanceDto>,
>(instance: T): T {
  const hidden = new Set<string>();
  const definition = {
    ...instance.definition,
    stages: instance.definition.stages.map((stage) => ({
      ...stage,
      blocks: stage.blocks.filter((block) => {
        const allowed = block.type !== "staff_information";
        if (!allowed) hidden.add(`${stage.id}:${block.id}`);
        return allowed;
      }),
    })),
  };
  return {
    ...instance,
    definition,
    values: instance.values.filter((value) => {
      if (!value || typeof value !== "object") return true;
      const item = value as { stageId?: unknown; blockId?: unknown };
      return !hidden.has(`${String(item.stageId)}:${String(item.blockId)}`);
    }),
    events: instance.events.filter((event) => {
      if (!event || typeof event !== "object") return true;
      const item = event as { stageId?: unknown; blockId?: unknown };
      return !hidden.has(`${String(item.stageId)}:${String(item.blockId)}`);
    }),
  };
}

async function instanceRow(organizationId: string, instanceId: string) {
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .select(instanceColumns)
    .eq("organization_id", organizationId)
    .eq("id", instanceId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "Quote flow instance not found.");
  return result.data as unknown as FlowInstanceRow;
}

async function instanceValues(organizationId: string, instanceId: string) {
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_values")
    .select(
      "id,stage_id,block_id,value,completed_by,completed_by_type,completed_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("instance_id", instanceId)
    .order("completed_at", { ascending: true });
  if (result.error) throw result.error;
  return result.data.map((row) => ({
    id: row.id,
    stageId: row.stage_id,
    blockId: row.block_id,
    value: row.value,
    completedBy: row.completed_by,
    completedByType: row.completed_by_type,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }));
}

async function instanceEvents(organizationId: string, instanceId: string) {
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_events")
    .select(
      "id,stage_id,block_id,event_type,actor_type,actor_id,actor_name,evidence,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("instance_id", instanceId)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  return result.data.map((event) => ({
    id: event.id,
    stageId: event.stage_id,
    blockId: event.block_id,
    eventType: event.event_type,
    actorType: event.actor_type,
    actorId: event.actor_id,
    actorName: event.actor_name,
    evidence: event.evidence,
    createdAt: event.created_at,
  }));
}

async function quoteFlowValueExists(
  organizationId: string,
  instanceId: string,
  stageId: string,
  blockId: string,
) {
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_values")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("instance_id", instanceId)
    .eq("stage_id", stageId)
    .eq("block_id", blockId)
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

async function appendQuoteFlowEvent(input: {
  organizationId: string;
  instanceId: string;
  stageId: string;
  blockId: string;
  eventType:
    | "signed"
    | "initialed"
    | "signed_in_person"
    | "signed_on_behalf"
    | "payment_completed"
    | "required_steps_overridden"
    | "project_created";
  actorType: "customer" | "staff" | "system";
  actorId?: string | null;
  actorName?: string | null;
  evidence?: Record<string, unknown>;
}) {
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_events")
    .insert({
      organization_id: input.organizationId,
      instance_id: input.instanceId,
      stage_id: input.stageId,
      block_id: input.blockId,
      event_type: input.eventType,
      actor_type: input.actorType,
      actor_id: input.actorId || null,
      actor_name: input.actorName || null,
      evidence: input.evidence || {},
    });
  if (result.error) throw result.error;
}

async function completeImmutableQuoteFlowBlock(input: {
  organizationId: string;
  instanceId: string;
  stageId: string;
  blockId: string;
  value: Record<string, unknown>;
  completedBy?: string | null;
  actorType: "customer" | "staff" | "system";
  eventType:
    | "signed"
    | "initialed"
    | "signed_in_person"
    | "signed_on_behalf"
    | "payment_completed";
  actorName?: string | null;
  evidence?: Record<string, unknown>;
}) {
  const result = await supabaseAdmin().rpc(
    "remodel_complete_quote_flow_block",
    {
      p_organization_id: input.organizationId,
      p_instance_id: input.instanceId,
      p_stage_id: input.stageId,
      p_block_id: input.blockId,
      p_value: input.value,
      p_completed_by: input.completedBy || null,
      p_actor_type: input.actorType,
      p_event_type: input.eventType,
      p_actor_name: input.actorName || null,
      p_evidence: input.evidence || input.value,
    },
  );
  if (result.error) throw result.error;
  if (!result.data)
    throw new HttpError(409, "This required step has already been completed.");
}

function agreementTemplateForBlock(
  definition: QuoteFlowDefinition,
  stageIndex: number,
  blockId: string,
) {
  const direct = definition.stages[stageIndex]?.blocks.find(
    (block) => block.id === blockId,
  )?.config.templateId;
  if (typeof direct === "string" && direct) return direct;
  for (let index = stageIndex; index >= 0; index -= 1) {
    const document = [...definition.stages[index].blocks]
      .reverse()
      .find(
        (block) =>
          block.enabled &&
          ["uploaded_pdf", "generated_document"].includes(block.type) &&
          typeof block.config.templateId === "string",
      );
    if (document) return String(document.config.templateId);
  }
  return null;
}

async function completedAgreementBlocks(
  organizationId: string,
  quoteId: string,
  definition: QuoteFlowDefinition,
) {
  const packets = await supabaseAdmin()
    .from("remodel_agreement_packets")
    .select("id,template_id,completed_at")
    .eq("organization_id", organizationId)
    .eq("project_id", quoteId)
    .eq("status", "completed");
  if (packets.error) throw packets.error;
  const byTemplate = new Map(
    (packets.data || []).map((packet) => [packet.template_id, packet]),
  );
  return definition.stages.flatMap((stage, stageIndex) =>
    stage.blocks.flatMap((block) => {
      if (!block.enabled || !["signature", "initials"].includes(block.type))
        return [];
      const templateId = agreementTemplateForBlock(
        definition,
        stageIndex,
        block.id,
      );
      const packet = templateId ? byTemplate.get(templateId) : null;
      return packet
        ? [
            {
              id: `agreement:${packet.id}:${block.id}`,
              stageId: stage.id,
              blockId: block.id,
              value: {
                method: "agreement_packet",
                packetId: packet.id,
                templateId,
                signedAt: packet.completed_at,
              },
              completedBy: null,
              completedByType: "customer",
              completedAt: packet.completed_at,
              updatedAt: packet.completed_at,
            },
          ]
        : [];
    }),
  );
}

async function instanceValuesWithAgreementStatus(row: FlowInstanceRow) {
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const [stored, agreement] = await Promise.all([
    instanceValues(row.organization_id, row.id),
    completedAgreementBlocks(row.organization_id, row.quote_id, definition),
  ]);
  const storedKeys = new Set(
    stored.map((value) => `${value.stageId}:${value.blockId}`),
  );
  return [
    ...stored,
    ...agreement.filter(
      (value) => !storedKeys.has(`${value.stageId}:${value.blockId}`),
    ),
  ];
}

function quoteFlowBlockIsComplete(block: QuoteFlowBlock, value: unknown) {
  if (value === undefined || value === null) return false;
  if (block.type === "deposit_collection")
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).status === "paid"
    );
  if (block.type === "internal_approval")
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).approved === true
    );
  return true;
}

export async function getQuoteFlowInstance(
  organizationId: string,
  input: { instanceId?: string; quoteId?: string },
) {
  let query = supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .select(instanceColumns)
    .eq("organization_id", organizationId);
  query = input.instanceId
    ? query.eq("id", input.instanceId)
    : query.eq("quote_id", input.quoteId || "");
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const row = result.data as unknown as FlowInstanceRow;
  const [values, events] = await Promise.all([
    instanceValuesWithAgreementStatus(row),
    instanceEvents(organizationId, row.id),
  ]);
  return instanceDto(row, values, events);
}

export async function createQuoteFlowInstance(
  user: WorkspaceUser,
  input: { quoteId: string; templateId?: string },
) {
  const existing = await getQuoteFlowInstance(user.organizationId, {
    quoteId: input.quoteId,
  });
  if (existing) return existing;
  const quote = await supabaseAdmin()
    .from("remodel_records")
    .select("id,kind,data,updated_at")
    .eq("organization_id", user.organizationId)
    .eq("id", input.quoteId)
    .eq("kind", "quote")
    .maybeSingle();
  if (quote.error) throw quote.error;
  if (!quote.data) throw new HttpError(404, "Quote not found.");
  const published = await publishedQuoteFlowVersion(
    user.organizationId,
    input.templateId,
  );
  const firstStage = published.definition.stages.find((stage) => stage.enabled);
  if (!firstStage)
    throw new HttpError(409, "The selected flow has no enabled stages.");
  const now = new Date().toISOString();
  const inserted = await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .insert({
      organization_id: user.organizationId,
      quote_id: input.quoteId,
      template_id: published.templateId,
      template_version: published.version,
      status: "active",
      current_stage_id: firstStage.id,
      definition_snapshot: published.definition,
      context_snapshot: {
        quote: quote.data.data,
        quoteUpdatedAt: quote.data.updated_at,
        templateName: published.name,
        templatePublishedAt: published.publishedAt,
      },
      created_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select(instanceColumns)
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const concurrent = await getQuoteFlowInstance(user.organizationId, {
        quoteId: input.quoteId,
      });
      if (concurrent) return concurrent;
    }
    throw inserted.error;
  }
  return instanceDto(inserted.data as unknown as FlowInstanceRow);
}

function stageAndBlock(
  definition: QuoteFlowDefinition,
  stageId: string,
  blockId: string,
  resolve: (condition: QuoteFlowCondition) => unknown,
) {
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === stageId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage) throw new HttpError(404, "Flow stage not found.");
  const block = stage.blocks.find(
    (candidate) =>
      candidate.id === blockId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!block) throw new HttpError(404, "Flow block not found.");
  if (stage.audience === "customer" || block.audience === "customer")
    throw new HttpError(
      403,
      "This response must be completed by the customer.",
    );
  return { stage, block };
}

async function assertQuoteFlowSigningOrder(
  row: FlowInstanceRow,
  definition: QuoteFlowDefinition,
  targetStageId: string,
  targetBlock: QuoteFlowBlock,
  resolve: (condition: QuoteFlowCondition) => unknown,
) {
  if (!["signature", "initials"].includes(targetBlock.type)) return;
  const signingBlocks = definition.stages.flatMap((stage) =>
    stage.blocks
      .filter(
        (block) =>
          stage.enabled &&
          block.enabled &&
          ["signature", "initials"].includes(block.type) &&
          quoteFlowConditionsMatch(stage.conditions, resolve) &&
          quoteFlowConditionsMatch(block.conditions, resolve),
      )
      .map((block, blockIndex) => ({
        stageId: stage.id,
        block,
        fallbackOrder: definition.stages.indexOf(stage) * 100 + blockIndex + 1,
      })),
  );
  const target = signingBlocks.find(
    (item) =>
      item.stageId === targetStageId && item.block.id === targetBlock.id,
  );
  if (!target) return;
  const targetOrder = Number.isFinite(Number(targetBlock.config.order))
    ? Number(targetBlock.config.order)
    : target.fallbackOrder;
  const values = await instanceValuesWithAgreementStatus(row);
  const completed = new Set(
    values.map((value) => `${value.stageId}:${value.blockId}`),
  );
  const missingPrior = signingBlocks.filter((item) => {
    const order = Number.isFinite(Number(item.block.config.order))
      ? Number(item.block.config.order)
      : item.fallbackOrder;
    return (
      order < targetOrder &&
      item.block.required &&
      !completed.has(`${item.stageId}:${item.block.id}`)
    );
  });
  if (missingPrior.length)
    throw new HttpError(
      409,
      `Complete the prior signing step first: ${missingPrior[0].block.label}.`,
    );
}

async function flowRuntimeResolver(
  row: FlowInstanceRow,
  definition: QuoteFlowDefinition,
  staffRole?: string,
) {
  const admin = supabaseAdmin();
  const [quoteResult, relatedResult, values] = await Promise.all([
    admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", row.organization_id)
      .eq("id", row.quote_id)
      .maybeSingle(),
    admin
      .from("remodel_records")
      .select("kind,data")
      .eq("organization_id", row.organization_id)
      .eq("project_id", row.quote_id)
      .in("kind", ["scope", "activity"])
      .limit(2_001),
    instanceValuesWithAgreementStatus(row),
  ]);
  if (quoteResult.error) throw quoteResult.error;
  if (relatedResult.error) throw relatedResult.error;
  if (!quoteResult.data) throw new HttpError(404, "Quote not found.");
  if ((relatedResult.data || []).length > 2_000)
    throw new HttpError(409, "This quote has too many related records.");
  const quote = (quoteResult.data.data || {}) as Record<string, unknown>;
  const scope = (relatedResult.data || [])
    .filter((record) => record.kind === "scope")
    .map((record) => record.data as Record<string, unknown>);
  const activities = (relatedResult.data || [])
    .filter((record) => record.kind === "activity")
    .map((record) => record.data as Record<string, unknown>);
  const responses = Object.fromEntries(
    values.map((value) => [value.blockId, value.value]),
  );
  const requiredSignatures = definition.stages.flatMap((stage) =>
    stage.blocks.filter(
      (block) =>
        block.enabled &&
        block.required &&
        ["signature", "initials"].includes(block.type),
    ),
  );
  const paid = activities.reduce(
    (total, activity) =>
      activity.activityType === "Payment received"
        ? total + Number(activity.amount || 0)
        : total,
    0,
  );
  const quoteTotal = scope.reduce(
    (sum, item) => sum + Number(item.estimate || 0),
    0,
  );
  return (condition: QuoteFlowCondition) => {
    const key = condition.fieldKey || "";
    if (condition.field === "quote.total") return quoteTotal;
    if (condition.field === "quote.item_ids")
      return scope.map((item) => String(item.id || ""));
    if (condition.field === "quote.categories")
      return scope.map((item) =>
        String(item.sectionName || quote.category || ""),
      );
    if (condition.field === "project.type") return quote.category;
    if (condition.field === "staff.role") return staffRole || "customer";
    if (condition.field === "payment.status") {
      if (paid <= 0) return "unpaid";
      if (quoteTotal > 0 && paid < quoteTotal) return "partial";
      return "paid";
    }
    if (condition.field === "signature.status")
      return requiredSignatures.length > 0 &&
        requiredSignatures.every((block) => responses[block.id] !== undefined)
        ? "complete"
        : "pending";
    if (condition.field === "contact.field") {
      const contact: Record<string, unknown> = {
        name: quote.client,
        email: quote.clientEmail,
        phone: quote.clientPhone,
        address: quote.address,
      };
      return contact[key];
    }
    if (condition.field === "project.field") return quote[key];
    if (
      condition.field === "custom.field" ||
      condition.field === "customer.response"
    )
      return responses[key];
    return undefined;
  };
}

async function quoteFlowPaymentBalance(
  row: FlowInstanceRow,
  block: QuoteFlowBlock,
) {
  const related = await supabaseAdmin()
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", row.organization_id)
    .eq("project_id", row.quote_id)
    .in("kind", ["scope", "activity"])
    .limit(2_001);
  if (related.error) throw related.error;
  if ((related.data || []).length > 2_000)
    throw new HttpError(409, "This quote has too many related records.");
  const totalCents = (related.data || []).reduce(
    (total, record) =>
      record.kind === "scope"
        ? total + Math.round(Number(record.data?.estimate || 0) * 100)
        : total,
    0,
  );
  const allPaidCents = (related.data || []).reduce(
    (total, record) =>
      record.kind === "activity" &&
      record.data?.activityType === "Payment received"
        ? total + Math.round(Number(record.data?.amount || 0) * 100)
        : total,
    0,
  );
  const blockPaidCents = (related.data || []).reduce(
    (total, record) =>
      record.kind === "activity" &&
      record.data?.activityType === "Payment received" &&
      record.data?.flowInstanceId === row.id &&
      record.data?.flowBlockId === block.id
        ? total + Math.round(Number(record.data?.amount || 0) * 100)
        : total,
    0,
  );
  const mode = String(block.config.amountMode || "percent");
  const configured =
    mode === "fixed"
      ? Math.round(Number(block.config.amount || 0) * 100)
      : mode === "remaining"
        ? Math.max(0, totalCents - allPaidCents)
        : Math.round(totalCents * (Number(block.config.percent || 100) / 100));
  if (!Number.isSafeInteger(configured) || configured <= 0)
    throw new HttpError(409, "Configure a valid payment amount for this step.");
  const previouslyApplied =
    mode === "remaining" ? 0 : Math.min(blockPaidCents, configured);
  return {
    quoteTotalCents: totalCents,
    targetCents: configured,
    paidCents: blockPaidCents,
    dueCents: Math.max(0, configured - previouslyApplied),
  };
}

function normalizedFlowValue(
  block: QuoteFlowBlock,
  value: unknown,
  evidence?: { ipHash?: string; userAgent?: string; method?: string },
) {
  if (block.type === "custom_text") {
    if (typeof value !== "string" || value.length > 20_000)
      throw new HttpError(400, `${block.label} must be valid text.`);
    return value;
  }
  if (["custom_number", "custom_currency"].includes(block.type)) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric))
      throw new HttpError(400, `${block.label} must be a number.`);
    return numeric;
  }
  if (block.type === "custom_date") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new HttpError(400, `${block.label} must be a date.`);
    return value;
  }
  if (block.type === "custom_checkbox") {
    if (typeof value !== "boolean")
      throw new HttpError(400, `${block.label} must be checked or unchecked.`);
    return value;
  }
  const options = Array.isArray(block.config.options)
    ? block.config.options.map(String)
    : [];
  if (block.type === "custom_select") {
    if (
      typeof value !== "string" ||
      value.length > 500 ||
      (options.length > 0 && value && !options.includes(value))
    )
      throw new HttpError(400, `${block.label} has an invalid selection.`);
    return value;
  }
  if (block.type === "custom_multiselect") {
    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      value.some(
        (item) =>
          typeof item !== "string" ||
          item.length > 500 ||
          (options.length > 0 && !options.includes(item)),
      )
    )
      throw new HttpError(400, `${block.label} has invalid selections.`);
    return [...new Set(value)];
  }
  if (block.type === "custom_file") {
    if (!value || typeof value !== "object")
      throw new HttpError(400, `${block.label} needs an uploaded file.`);
    const file = value as Record<string, unknown>;
    if (
      typeof file.id !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(file.id) ||
      typeof file.name !== "string" ||
      file.name.length > 200 ||
      typeof file.mime !== "string" ||
      file.mime.length > 100 ||
      !Number.isSafeInteger(file.size) ||
      Number(file.size) <= 0
    )
      throw new HttpError(400, `${block.label} has invalid file metadata.`);
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
    };
  }
  if (block.type === "signature") {
    if (!value || typeof value !== "object")
      throw new HttpError(400, `Complete ${block.label}.`);
    const signature = value as Record<string, unknown>;
    const signedName = String(signature.signedName || "").trim();
    const strokes = signatureStrokesSchema.safeParse(
      signature.signatureStrokes,
    );
    if (
      signedName.length < 2 ||
      signedName.length > 200 ||
      signature.accepted !== true ||
      !strokes.success
    )
      throw new HttpError(400, `Complete the signature for ${block.label}.`);
    return {
      method: evidence?.method || "electronic",
      signerRoleId: String(block.config.signerRoleId || "customer"),
      signedName,
      accepted: true,
      signatureStrokes: strokes.data,
      signedAt: new Date().toISOString(),
      ...(evidence?.ipHash ? { ipHash: evidence.ipHash.slice(0, 128) } : {}),
      ...(evidence?.userAgent
        ? { userAgent: evidence.userAgent.slice(0, 300) }
        : {}),
    };
  }
  if (block.type === "initials") {
    if (!value || typeof value !== "object")
      throw new HttpError(400, `Complete ${block.label}.`);
    const entry = value as Record<string, unknown>;
    const initials = String(entry.initials || "")
      .trim()
      .toUpperCase();
    if (entry.accepted !== true || !/^[A-Z0-9.' -]{1,12}$/.test(initials))
      throw new HttpError(400, `Enter valid initials for ${block.label}.`);
    return {
      method: evidence?.method || "electronic",
      signerRoleId: String(block.config.signerRoleId || "customer"),
      initials,
      accepted: true,
      signedAt: new Date().toISOString(),
      ...(evidence?.ipHash ? { ipHash: evidence.ipHash.slice(0, 128) } : {}),
      ...(evidence?.userAgent
        ? { userAgent: evidence.userAgent.slice(0, 300) }
        : {}),
    };
  }
  return value;
}

export async function saveQuoteFlowValue(
  user: WorkspaceUser,
  instanceId: string,
  input: { stageId: string; blockId: string; value: unknown },
) {
  const row = await instanceRow(user.organizationId, instanceId);
  if (row.status !== "active")
    throw new HttpError(409, "This quote flow is no longer active.");
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition, user.group);
  const { stage, block } = stageAndBlock(
    definition,
    input.stageId,
    input.blockId,
    resolve,
  );
  let value: unknown;
  if (block.type === "internal_approval") {
    const allowedRoles = Array.isArray(block.config.allowedRoles)
      ? block.config.allowedRoles.map(String)
      : [];
    if (allowedRoles.length && !allowedRoles.includes(user.group))
      throw new HttpError(403, "Your role cannot approve this step.");
    value = {
      approved: true,
      approvedBy: user.name,
      approvedById: user.id,
      approvedAt: new Date().toISOString(),
    };
  } else
    value = normalizedFlowValue(block, input.value, {
      method: "staff_entry",
    });
  const serialized = JSON.stringify(value);
  if (serialized.length > 250_000)
    throw new HttpError(413, "This response is too large.");
  if (["signature", "initials"].includes(block.type)) {
    await assertQuoteFlowSigningOrder(
      row,
      definition,
      stage.id,
      block,
      resolve,
    );
    await completeImmutableQuoteFlowBlock({
      organizationId: user.organizationId,
      instanceId,
      stageId: stage.id,
      blockId: block.id,
      value: value as Record<string, unknown>,
      completedBy: user.id,
      actorType: "staff",
      eventType: block.type === "signature" ? "signed" : "initialed",
      actorName: user.name,
      evidence: value as Record<string, unknown>,
    });
    return getQuoteFlowInstance(user.organizationId, { instanceId });
  }
  const now = new Date().toISOString();
  const result = await supabaseAdmin().from("remodel_quote_flow_values").upsert(
    {
      organization_id: user.organizationId,
      instance_id: instanceId,
      stage_id: input.stageId,
      block_id: input.blockId,
      value,
      completed_by: user.id,
      completed_by_type: "staff",
      completed_at: now,
      updated_at: now,
    },
    { onConflict: "organization_id,instance_id,stage_id,block_id" },
  );
  if (result.error) throw result.error;
  await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .update({ updated_at: now })
    .eq("organization_id", user.organizationId)
    .eq("id", instanceId);
  return getQuoteFlowInstance(user.organizationId, { instanceId });
}

export async function markQuoteFlowSignedInPerson(
  user: WorkspaceUser,
  instanceId: string,
  input: {
    stageId: string;
    blockId: string;
    signedName: string;
    reference: string;
  },
) {
  const row = await instanceRow(user.organizationId, instanceId);
  if (row.status !== "active")
    throw new HttpError(409, "This quote flow is no longer active.");
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition, user.group);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const block = stage?.blocks.find(
    (candidate) =>
      candidate.id === input.blockId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage || !block || !["signature", "initials"].includes(block.type))
    throw new HttpError(404, "Signature field not found.");
  const methods = Array.isArray(block.config.methods)
    ? block.config.methods.map(String)
    : ["remote", "onsite", "in_person"];
  if (!methods.includes("in_person"))
    throw new HttpError(409, "In-person signing is disabled for this field.");
  await assertQuoteFlowSigningOrder(row, definition, stage.id, block, resolve);
  if (
    await quoteFlowValueExists(
      user.organizationId,
      instanceId,
      stage.id,
      block.id,
    )
  )
    throw new HttpError(409, "This signature has already been completed.");
  const now = new Date().toISOString();
  const value = {
    method: "in_person",
    signedName: input.signedName,
    reference: input.reference,
    witnessedBy: user.name,
    witnessedById: user.id,
    signedAt: now,
  };
  await completeImmutableQuoteFlowBlock({
    organizationId: user.organizationId,
    instanceId,
    stageId: stage.id,
    blockId: block.id,
    value,
    completedBy: user.id,
    eventType: "signed_in_person",
    actorType: "staff",
    actorName: user.name,
    evidence: value,
  });
  return getQuoteFlowInstance(user.organizationId, { instanceId });
}

export async function signQuoteFlowOnBehalf(
  user: WorkspaceUser,
  instanceId: string,
  input: {
    stageId: string;
    blockId: string;
    signedName: string;
    authorization: string;
  },
) {
  const row = await instanceRow(user.organizationId, instanceId);
  if (row.status !== "active")
    throw new HttpError(409, "This quote flow is no longer active.");
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition, user.group);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const block = stage?.blocks.find(
    (candidate) =>
      candidate.id === input.blockId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage || !block || block.type !== "signature")
    throw new HttpError(404, "Signature field not found.");
  const methods = Array.isArray(block.config.methods)
    ? block.config.methods.map(String)
    : ["remote", "onsite", "in_person"];
  if (!methods.includes("on_behalf"))
    throw new HttpError(409, "Signing on behalf is disabled for this field.");
  await assertQuoteFlowSigningOrder(row, definition, stage.id, block, resolve);
  if (
    await quoteFlowValueExists(
      user.organizationId,
      instanceId,
      stage.id,
      block.id,
    )
  )
    throw new HttpError(409, "This signature has already been completed.");
  const authorization = input.authorization.trim();
  if (authorization.length < 10)
    throw new HttpError(
      400,
      "Describe the authority to sign on this person’s behalf.",
    );
  const now = new Date().toISOString();
  const value = {
    method: "on_behalf",
    signedName: input.signedName.trim(),
    signerRoleId: String(block.config.signerRoleId || "customer"),
    authorization,
    signedBy: user.name,
    signedById: user.id,
    signedAt: now,
  };
  await completeImmutableQuoteFlowBlock({
    organizationId: user.organizationId,
    instanceId,
    stageId: stage.id,
    blockId: block.id,
    value,
    completedBy: user.id,
    eventType: "signed_on_behalf",
    actorType: "staff",
    actorName: user.name,
    evidence: value,
  });
  return getQuoteFlowInstance(user.organizationId, { instanceId });
}

export async function moveQuoteFlowInstance(
  user: WorkspaceUser,
  instanceId: string,
  input: { stageId: string; allowOverride?: boolean; overrideReason?: string },
) {
  const row = await instanceRow(user.organizationId, instanceId);
  if (row.status !== "active")
    throw new HttpError(409, "This quote flow is no longer active.");
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition, user.group);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage) throw new HttpError(404, "Flow stage not found.");
  const enabledStages = definition.stages.filter(
    (candidate) =>
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const currentIndex = enabledStages.findIndex(
    (candidate) => candidate.id === row.current_stage_id,
  );
  const targetIndex = enabledStages.findIndex(
    (candidate) => candidate.id === stage.id,
  );
  const stored = await instanceValuesWithAgreementStatus(row);
  const storedByBlock = new Map(
    stored.map((value) => [`${value.stageId}:${value.blockId}`, value.value]),
  );
  const valueRequiredTypes = new Set([
    "custom_text",
    "custom_number",
    "custom_currency",
    "custom_date",
    "custom_checkbox",
    "custom_select",
    "custom_multiselect",
    "custom_file",
    "signature",
    "initials",
    "deposit_collection",
    "internal_approval",
  ]);
  const missing =
    targetIndex > currentIndex && currentIndex >= 0
      ? enabledStages
          .slice(currentIndex, targetIndex)
          .flatMap((candidate) =>
            candidate.blocks
              .filter(
                (block) =>
                  block.enabled &&
                  quoteFlowConditionsMatch(block.conditions, resolve) &&
                  block.required &&
                  valueRequiredTypes.has(block.type) &&
                  !quoteFlowBlockIsComplete(
                    block,
                    storedByBlock.get(`${candidate.id}:${block.id}`),
                  ),
              )
              .map((block) => `${candidate.title}: ${block.label}`),
          )
      : [];
  if (missing.length && !input.allowOverride)
    throw new HttpError(
      409,
      `Complete required fields before continuing: ${missing.join(", ")}`,
    );
  if (missing.length && input.allowOverride) {
    const reason = input.overrideReason?.trim() || "";
    if (reason.length < 5)
      throw new HttpError(400, "Add a reason for overriding required steps.");
    const now = new Date().toISOString();
    const override = await supabaseAdmin()
      .from("remodel_quote_flow_values")
      .upsert(
        {
          organization_id: user.organizationId,
          instance_id: instanceId,
          stage_id: row.current_stage_id,
          block_id: "__required_step_override__",
          value: {
            reason,
            missing,
            overriddenBy: user.name,
            overriddenAt: now,
          },
          completed_by: user.id,
          completed_by_type: "staff",
          completed_at: now,
          updated_at: now,
        },
        { onConflict: "organization_id,instance_id,stage_id,block_id" },
      );
    if (override.error) throw override.error;
    await appendQuoteFlowEvent({
      organizationId: user.organizationId,
      instanceId,
      stageId: row.current_stage_id,
      blockId: "__required_step_override__",
      eventType: "required_steps_overridden",
      actorType: "staff",
      actorId: user.id,
      actorName: user.name,
      evidence: { reason, missing, targetStageId: stage.id },
    });
  }
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .update({
      current_stage_id: stage.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organizationId)
    .eq("id", instanceId)
    .eq("status", "active")
    .select(instanceColumns)
    .single();
  if (result.error) throw result.error;
  return instanceDto(
    result.data as unknown as FlowInstanceRow,
    await instanceValuesWithAgreementStatus(
      result.data as unknown as FlowInstanceRow,
    ),
    await instanceEvents(user.organizationId, instanceId),
  );
}

async function completeQuoteFlowPayment(
  row: FlowInstanceRow,
  stageId: string,
  blockId: string,
  value: Record<string, unknown>,
  completedBy: string | null,
  completedByType: "staff" | "customer" | "system",
) {
  const now = new Date().toISOString();
  const completedValue = { status: "paid", ...value, completedAt: now };
  await completeImmutableQuoteFlowBlock({
    organizationId: row.organization_id,
    instanceId: row.id,
    stageId,
    blockId,
    value: completedValue,
    completedBy,
    eventType: "payment_completed",
    actorType: completedByType,
    evidence: completedValue,
  });
}

export async function recordManualQuoteFlowPayment(
  user: WorkspaceUser,
  instanceId: string,
  input: {
    stageId: string;
    blockId: string;
    requestId: string;
    amount: number;
    method: string;
    reference: string;
  },
) {
  const row = await instanceRow(user.organizationId, instanceId);
  if (row.status !== "active")
    throw new HttpError(409, "This quote flow is no longer active.");
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition, user.group);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const block = stage?.blocks.find(
    (candidate) =>
      candidate.id === input.blockId &&
      candidate.enabled &&
      candidate.type === "deposit_collection" &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage || !block) throw new HttpError(404, "Payment step not found.");
  const providers = Array.isArray(block.config.providers)
    ? block.config.providers.map(String)
    : ["manual", "stripe"];
  if (
    !providers.some((provider) => ["manual", "manual_check"].includes(provider))
  )
    throw new HttpError(409, "Manual payments are disabled for this step.");
  const amountCents = Math.round(input.amount * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new HttpError(400, "Enter a valid payment amount.");
  const existing = await supabaseAdmin()
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", user.organizationId)
    .eq("id", input.requestId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (
    existing.data &&
    (existing.data.kind !== "activity" ||
      existing.data.data?.flowInstanceId !== instanceId ||
      existing.data.data?.flowBlockId !== block.id ||
      Math.round(Number(existing.data.data?.amount || 0) * 100) !==
        amountCents ||
      existing.data.data?.paymentMethod !== input.method)
  )
    throw new HttpError(409, "This payment request was already used.");
  const balance = await quoteFlowPaymentBalance(row, block);
  if (balance.dueCents <= 0 && existing.data) {
    if (
      !(await quoteFlowValueExists(
        user.organizationId,
        instanceId,
        stage.id,
        block.id,
      ))
    )
      await completeQuoteFlowPayment(
        row,
        stage.id,
        block.id,
        {
          method: input.method,
          targetAmount: balance.targetCents / 100,
          reference: input.reference,
        },
        user.id,
        "staff",
      );
    return getQuoteFlowInstance(user.organizationId, { instanceId });
  }
  if (balance.dueCents <= 0)
    throw new HttpError(409, "This payment step is already complete.");
  if (amountCents > balance.dueCents)
    throw new HttpError(
      400,
      "The amount exceeds this step’s remaining balance.",
    );
  if (!existing.data) {
    const quote = await supabaseAdmin()
      .from("remodel_records")
      .select("data")
      .eq("organization_id", user.organizationId)
      .eq("id", row.quote_id)
      .maybeSingle();
    if (quote.error) throw quote.error;
    if (!quote.data) throw new HttpError(404, "Quote not found.");
    const now = new Date().toISOString();
    const data = {
      id: input.requestId,
      projectId: row.quote_id,
      activityType: "Payment received",
      actorId: user.id,
      actorName: user.name,
      authorId: user.id,
      authorName: user.name,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      summary: `${input.method} payment received`,
      notes: input.reference
        ? `Reference: ${input.reference}`
        : "Recorded manually.",
      amount: amountCents / 100,
      party: String(quote.data.data?.client || "Customer"),
      paymentMethod: input.method,
      contractorId: "",
      attachmentIds: [],
      flowInstanceId: instanceId,
      flowStageId: stage.id,
      flowBlockId: block.id,
    };
    const inserted = await supabaseAdmin().from("remodel_records").insert({
      id: input.requestId,
      organization_id: user.organizationId,
      created_by: user.id,
      updated_by: user.id,
      kind: "activity",
      project_id: row.quote_id,
      data,
      updated_at: now,
    });
    if (inserted.error) throw inserted.error;
  }
  const nextBalance = await quoteFlowPaymentBalance(row, block);
  if (nextBalance.dueCents <= 0)
    await completeQuoteFlowPayment(
      row,
      stage.id,
      block.id,
      {
        method: input.method,
        targetAmount: balance.targetCents / 100,
        reference: input.reference,
      },
      user.id,
      "staff",
    );
  return getQuoteFlowInstance(user.organizationId, { instanceId });
}

export async function createCustomerQuoteFlowCheckout(
  organizationId: string,
  quoteId: string,
  input: {
    stageId: string;
    blockId: string;
    successUrl: string;
    cancelUrl: string;
  },
) {
  const rowResult = await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .select(instanceColumns)
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .eq("status", "active")
    .maybeSingle();
  if (rowResult.error) throw rowResult.error;
  if (!rowResult.data) throw new HttpError(404, "Quote flow is unavailable.");
  const row = rowResult.data as unknown as FlowInstanceRow;
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      ["customer", "both"].includes(candidate.audience) &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const block = stage?.blocks.find(
    (candidate) =>
      candidate.id === input.blockId &&
      candidate.enabled &&
      candidate.type === "deposit_collection" &&
      ["customer", "both"].includes(candidate.audience) &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage || !block) throw new HttpError(404, "Payment step not found.");
  const providers = Array.isArray(block.config.providers)
    ? block.config.providers.map(String)
    : ["manual", "stripe"];
  if (!providers.includes("stripe"))
    throw new HttpError(409, "Online payment is disabled for this step.");
  const balance = await quoteFlowPaymentBalance(row, block);
  if (balance.dueCents <= 0)
    throw new HttpError(409, "This payment step is already complete.");
  const [quote, business, providerStatus] = await Promise.all([
    supabaseAdmin()
      .from("remodel_records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("id", quoteId)
      .maybeSingle(),
    getBusinessConfigForOrganization(organizationId),
    paymentProviderAdapter("stripe").status(organizationId),
  ]);
  if (quote.error) throw quote.error;
  if (!quote.data) throw new HttpError(404, "Quote not found.");
  if (!providerStatus.ready)
    throw new HttpError(
      503,
      providerStatus.detail || "Online payment is unavailable.",
    );
  const provider = paymentProviderAdapter("stripe");
  if (!provider.createCheckout)
    throw new HttpError(503, "Online payment is unavailable.");
  const session = await provider.createCheckout({
    organizationId,
    amountCents: balance.dueCents,
    currency: business.regional.currency,
    description: `${business.profile.name} — ${block.label}`,
    customerEmail: String(quote.data.data?.clientEmail || "") || undefined,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: {
      source: "servicebuddy_quote_flow_payment_v1",
      organizationId,
      projectId: quoteId,
      flowInstanceId: row.id,
      flowStageId: stage.id,
      flowBlockId: block.id,
      amountCents: String(balance.dueCents),
      ...(row.created_by ? { createdById: row.created_by } : {}),
    },
  });
  return { url: session.url, amount: balance.dueCents / 100 };
}

export async function convertQuoteFlowToProject(
  user: WorkspaceUser,
  instanceId: string,
  input: { stageId: string; blockId: string },
) {
  const row = await instanceRow(user.organizationId, instanceId);
  if (row.status !== "active")
    throw new HttpError(409, "This quote flow is no longer active.");
  const definition = quoteFlowDefinitionSchema.parse(row.definition_snapshot);
  const resolve = await flowRuntimeResolver(row, definition, user.group);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      candidate.type === "project_conversion" &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const block = stage?.blocks.find(
    (candidate) =>
      candidate.id === input.blockId &&
      candidate.enabled &&
      candidate.type === "project_conversion" &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  if (!stage || !block)
    throw new HttpError(404, "Project conversion step not found.");
  if (block.config.renderer === "premium_quote_promotion_v1")
    throw new HttpError(409, "Use the configured compatibility handoff.");
  const stages = definition.stages.filter(
    (candidate) =>
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve),
  );
  const targetIndex = stages.findIndex(
    (candidate) => candidate.id === stage.id,
  );
  const values = await instanceValuesWithAgreementStatus(row);
  const storedByBlock = new Map(
    values.map((value) => [`${value.stageId}:${value.blockId}`, value.value]),
  );
  const requiredTypes = new Set([
    "custom_text",
    "custom_number",
    "custom_currency",
    "custom_date",
    "custom_checkbox",
    "custom_select",
    "custom_multiselect",
    "custom_file",
    "signature",
    "initials",
    "deposit_collection",
    "internal_approval",
  ]);
  const missing = stages
    .slice(0, targetIndex)
    .flatMap((candidate) =>
      candidate.blocks
        .filter(
          (candidateBlock) =>
            candidateBlock.enabled &&
            candidateBlock.required &&
            requiredTypes.has(candidateBlock.type) &&
            quoteFlowConditionsMatch(candidateBlock.conditions, resolve) &&
            !quoteFlowBlockIsComplete(
              candidateBlock,
              storedByBlock.get(`${candidate.id}:${candidateBlock.id}`),
            ),
        )
        .map((candidateBlock) => `${candidate.title}: ${candidateBlock.label}`),
    );
  if (missing.length)
    throw new HttpError(
      409,
      `Complete required steps before creating the project: ${missing.join(", ")}`,
    );
  const record = await supabaseAdmin()
    .from("remodel_records")
    .select("kind,data,updated_at")
    .eq("organization_id", user.organizationId)
    .eq("id", row.quote_id)
    .maybeSingle();
  if (record.error) throw record.error;
  if (!record.data || record.data.kind !== "quote")
    throw new HttpError(409, "This quote is no longer available.");
  const now = new Date(
    Math.max(Date.now(), Date.parse(record.data.updated_at) + 1),
  ).toISOString();
  const project: Record<string, unknown> = {
    ...(record.data.data as Record<string, unknown>),
    status: "Planning",
    completedDate: "",
    updatedAt: now,
  };
  const converted = await supabaseAdmin().rpc("remodel_complete_quote_flow", {
    p_organization_id: user.organizationId,
    p_instance_id: instanceId,
    p_quote_id: row.quote_id,
    p_expected_updated_at: record.data.updated_at,
    p_project_data: project,
    p_actor_id: user.id,
    p_actor_name: user.name,
    p_stage_id: stage.id,
    p_block_id: block.id,
  });
  if (converted.error) throw converted.error;
  if (!converted.data)
    throw new HttpError(
      409,
      "Quote changed. Refresh before creating the project.",
    );
  try {
    await enqueueWorkflowEvent({
      organizationId: user.organizationId,
      type: "project.created",
      objectType: "project",
      objectId: row.quote_id,
      ...(typeof project.contactId === "string"
        ? { contactId: project.contactId }
        : {}),
      actor: { type: "user", id: user.id, name: user.name },
      occurredAt: now,
      idempotencyKey: `project-created:flow:${instanceId}`,
      payload: {
        quoteId: row.quote_id,
        flowInstanceId: instanceId,
        templateVersion: row.template_version,
      },
    });
  } catch {
    console.error("Could not enqueue the configured project-created event.");
  }
  return {
    project,
    instance: await getQuoteFlowInstance(user.organizationId, { instanceId }),
  };
}

export async function getPublicQuoteFlowInstance(
  organizationId: string,
  quoteId: string,
) {
  const row = await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .select(instanceColumns)
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) return null;
  const instance = row.data as unknown as FlowInstanceRow;
  const definition = quoteFlowDefinitionSchema.parse(
    instance.definition_snapshot,
  );
  const resolve = await flowRuntimeResolver(instance, definition);
  const customerDefinition: QuoteFlowDefinition = {
    ...definition,
    stages: definition.stages
      .filter(
        (stage) =>
          stage.enabled &&
          ["customer", "both"].includes(stage.audience) &&
          quoteFlowConditionsMatch(stage.conditions, resolve),
      )
      .map((stage) => ({
        ...stage,
        conditions: { mode: "all" as const, rules: [] },
        blocks: stage.blocks
          .filter(
            (block) =>
              block.enabled &&
              ["customer", "both"].includes(block.audience) &&
              quoteFlowConditionsMatch(block.conditions, resolve),
          )
          .map((block) => ({
            ...block,
            conditions: { mode: "all" as const, rules: [] },
          })),
      })),
  };
  const template = await supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .select("template_key")
    .eq("organization_id", organizationId)
    .eq("id", instance.template_id)
    .maybeSingle();
  if (template.error) throw template.error;
  const allowed = new Set(
    customerDefinition.stages.flatMap((stage) =>
      stage.blocks.map((block) => `${stage.id}:${block.id}`),
    ),
  );
  const values = (await instanceValuesWithAgreementStatus(instance)).filter(
    (value) => allowed.has(`${value.stageId}:${value.blockId}`),
  );
  return {
    id: instance.id,
    quoteId: instance.quote_id,
    templateVersion: instance.template_version,
    templateKey: template.data?.template_key || null,
    portalRenderer:
      definition.stages
        .flatMap((stage) => stage.blocks)
        .find((block) => block.type === "delivery_controls")?.config.renderer ||
      "configurable_quote_flow_v1",
    status: instance.status,
    currentStageId: instance.current_stage_id,
    definition: customerDefinition,
    values,
  };
}

export async function saveCustomerQuoteFlowValue(
  organizationId: string,
  quoteId: string,
  input: { stageId: string; blockId: string; value: unknown },
  evidence?: { ipHash?: string; userAgent?: string },
) {
  const row = await supabaseAdmin()
    .from("remodel_quote_flow_instances")
    .select(instanceColumns)
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .eq("status", "active")
    .maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new HttpError(404, "Quote flow is unavailable.");
  const instance = row.data as unknown as FlowInstanceRow;
  const definition = quoteFlowDefinitionSchema.parse(
    instance.definition_snapshot,
  );
  const resolve = await flowRuntimeResolver(instance, definition);
  const stage = definition.stages.find(
    (candidate) =>
      candidate.id === input.stageId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve) &&
      ["customer", "both"].includes(candidate.audience),
  );
  const block = stage?.blocks.find(
    (candidate) =>
      candidate.id === input.blockId &&
      candidate.enabled &&
      quoteFlowConditionsMatch(candidate.conditions, resolve) &&
      ["customer", "both"].includes(candidate.audience),
  );
  if (!stage || !block)
    throw new HttpError(404, "Customer flow field not found.");
  await assertQuoteFlowSigningOrder(
    instance,
    definition,
    stage.id,
    block,
    resolve,
  );
  if (
    ["signature", "initials"].includes(block.type) &&
    (await quoteFlowValueExists(
      organizationId,
      instance.id,
      stage.id,
      block.id,
    ))
  )
    throw new HttpError(409, "This signature has already been completed.");
  const value = normalizedFlowValue(block, input.value, {
    ...evidence,
    method: "remote_portal",
  });
  const serialized = JSON.stringify(value);
  if (serialized.length > 250_000)
    throw new HttpError(413, "This response is too large.");
  const now = new Date().toISOString();
  if (["signature", "initials"].includes(block.type)) {
    await completeImmutableQuoteFlowBlock({
      organizationId,
      instanceId: instance.id,
      stageId: stage.id,
      blockId: block.id,
      value: value as Record<string, unknown>,
      eventType: block.type === "signature" ? "signed" : "initialed",
      actorType: "customer",
      actorName:
        value && typeof value === "object" && "signedName" in value
          ? String((value as Record<string, unknown>).signedName || "")
          : null,
      evidence:
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {},
    });
  } else {
    const result = await supabaseAdmin()
      .from("remodel_quote_flow_values")
      .upsert(
        {
          organization_id: organizationId,
          instance_id: instance.id,
          stage_id: stage.id,
          block_id: block.id,
          value,
          completed_by: null,
          completed_by_type: "customer",
          completed_at: now,
          updated_at: now,
        },
        { onConflict: "organization_id,instance_id,stage_id,block_id" },
      );
    if (result.error) throw result.error;
  }
  return getPublicQuoteFlowInstance(organizationId, quoteId);
}
