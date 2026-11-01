import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../supabase/server";
import {
  workflowEventSchema,
  type WorkflowEvent,
  type WorkflowEventType,
  type WorkflowObjectType,
} from "./schema";

export type WorkflowEventInput = {
  organizationId: string;
  type: WorkflowEventType;
  objectType: WorkflowObjectType;
  objectId: string;
  contactId?: string;
  actor?: WorkflowEvent["actor"];
  occurredAt?: string;
  correlationId?: string;
  causationId?: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
};

export function currentWorkflowRolloutMode(): "shadow" | "execute" {
  return process.env.WORKFLOW_CURRENT_FLOWS_MODE === "execute"
    ? "execute"
    : "shadow";
}

export function createWorkflowEvent(input: WorkflowEventInput): WorkflowEvent {
  return workflowEventSchema.parse({
    id: randomUUID(),
    schemaVersion: 1,
    type: input.type,
    organizationId: input.organizationId,
    actor: input.actor || { type: "system" },
    objectType: input.objectType,
    objectId: input.objectId,
    ...(input.contactId ? { contactId: input.contactId } : {}),
    occurredAt: input.occurredAt || new Date().toISOString(),
    correlationId: input.correlationId || randomUUID(),
    ...(input.causationId ? { causationId: input.causationId } : {}),
    idempotencyKey: input.idempotencyKey,
    payload: input.payload || {},
  });
}

export async function enqueueWorkflowEvent(input: WorkflowEventInput) {
  const event = createWorkflowEvent(input);
  const result = await supabaseAdmin().rpc("remodel_enqueue_workflow_event", {
    p_event_id: event.id,
    p_organization_id: event.organizationId,
    p_schema_version: event.schemaVersion,
    p_event_type: event.type,
    p_actor: event.actor,
    p_object_type: event.objectType,
    p_object_id: event.objectId,
    p_contact_id: event.contactId || null,
    p_occurred_at: event.occurredAt,
    p_correlation_id: event.correlationId,
    p_causation_id: event.causationId || null,
    p_idempotency_key: event.idempotencyKey,
    p_payload: event.payload,
  });
  if (result.error) throw result.error;
  const savedId = String(result.data?.eventId || event.id);
  return {
    event: { ...event, id: savedId },
    created: result.data?.created === true,
  };
}

/**
 * Records a production event and immediately builds a side-effect-free trace.
 * Domain routes deliberately treat failures here as non-fatal until shadow
 * parity is proven and execution is explicitly enabled.
 */
export async function recordWorkflowShadowEvent(input: WorkflowEventInput) {
  const queued = await enqueueWorkflowEvent(input);
  const { processWorkflowEvent } = await import("./engine");
  await processWorkflowEvent(queued.event.id, { mode: "shadow" });
  return queued;
}

export async function recordWorkflowEvent(input: WorkflowEventInput) {
  const queued = await enqueueWorkflowEvent(input);
  const mode = currentWorkflowRolloutMode();
  const { processWorkflowEvent } = await import("./engine");
  await processWorkflowEvent(queued.event.id, { mode });
  return { ...queued, mode };
}
