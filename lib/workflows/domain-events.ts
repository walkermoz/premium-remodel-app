import "server-only";

import type { WorkspaceUser } from "../auth";
import type { EntityKind } from "../types";
import { enqueueWorkflowEvent, type WorkflowEventInput } from "./events";
import { workflowRecordEvents } from "./domain-event-map";

type RecordValue = Record<string, unknown>;

export function workspaceRecordEvents(input: {
  user: WorkspaceUser;
  kind: EntityKind;
  before: RecordValue | null;
  after: RecordValue;
}) {
  const { user, kind, before, after } = input;
  if (
    !["contact", "lead", "quote", "project", "task", "actual_cost"].includes(
      kind,
    )
  )
    return [];
  return workflowRecordEvents({
    organizationId: user.organizationId,
    actor: { type: "user", id: user.id, name: user.name },
    kind: kind as
      "contact" | "lead" | "quote" | "project" | "task" | "actual_cost",
    before,
    after,
    idempotencyPrefix: "workspace",
  }) satisfies WorkflowEventInput[];
}

export async function emitWorkspaceRecordEvents(input: {
  user: WorkspaceUser;
  kind: EntityKind;
  before: RecordValue | null;
  after: RecordValue;
}) {
  const events = workspaceRecordEvents(input);
  await Promise.all(events.map((event) => enqueueWorkflowEvent(event)));
  return events.length;
}
