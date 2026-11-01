import { isDeepStrictEqual } from "node:util";
import type {
  WorkflowEvent,
  WorkflowEventType,
  WorkflowObjectType,
} from "./schema";

export type WorkflowRecordKind =
  "contact" | "lead" | "quote" | "project" | "task";

export type WorkflowRecordEvent = {
  organizationId: string;
  type: WorkflowEventType;
  objectType: WorkflowObjectType;
  objectId: string;
  contactId?: string;
  actor: WorkflowEvent["actor"];
  occurredAt: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

type RecordValue = Record<string, unknown>;

export function workflowRecordChanges(
  before: RecordValue | null,
  after: RecordValue,
) {
  if (!before) return {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ]) {
    if (Object.keys(changes).length >= 100) break;
    const from = before[key];
    const to = after[key];
    if (!isDeepStrictEqual(from, to)) changes[key] = { from, to };
  }
  return changes;
}

export function workflowRecordEvents(input: {
  organizationId: string;
  actor: WorkflowEvent["actor"];
  kind: WorkflowRecordKind;
  before: RecordValue | null;
  after: RecordValue;
  idempotencyPrefix?: string;
}) {
  const { organizationId, actor, kind, before, after } = input;
  const objectId = String(after.id || "");
  const occurredAt =
    typeof after.updatedAt === "string"
      ? after.updatedAt
      : new Date().toISOString();
  const objectType = kind === "task" ? "item" : kind;
  const contactId =
    kind === "contact"
      ? objectId
      : typeof after.contactId === "string"
        ? after.contactId
        : undefined;
  const changes = workflowRecordChanges(before, after);
  const types: WorkflowEventType[] = [];

  if (!before) {
    types.push(
      {
        contact: "contact.created",
        lead: "lead.created",
        quote: "quote.created",
        project: "project.created",
        task: "item.created",
      }[kind] as WorkflowEventType,
    );
  } else {
    if (kind === "contact" && Object.keys(changes).length)
      types.push("contact.updated");
    if (kind === "lead" && before.status !== after.status)
      types.push("lead.stage.changed");
    if (kind === "lead" && before.disposition !== after.disposition)
      types.push("lead.disposition.changed");
    if (kind === "quote" && before.status !== after.status) {
      if (after.status === "Sent") types.push("quote.sent");
      if (after.status === "Declined") types.push("quote.declined");
    }
    if (kind === "project" && before.status !== after.status)
      types.push("project.status.changed");
    if (kind === "task" && before.contractorId !== after.contractorId)
      types.push("item.assigned");
    if (kind === "task" && before.status !== "Done" && after.status === "Done")
      types.push("item.completed");
  }

  return types.map<WorkflowRecordEvent>((type) => ({
    organizationId,
    type,
    objectType,
    objectId,
    ...(contactId ? { contactId } : {}),
    actor,
    occurredAt,
    idempotencyKey: `${input.idempotencyPrefix || "record"}:${type}:${objectId}:${occurredAt}`,
    payload: {
      recordId: objectId,
      changes,
      name: after.name || after.title || "",
      status: after.status || "",
      disposition: after.disposition || "",
      projectId: after.projectId || null,
      contactId: contactId || null,
      contractorId: after.contractorId || null,
      leadId: after.leadId || null,
    },
  }));
}
