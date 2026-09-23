export const auditKinds = [
  "project",
  "quote",
  "task",
  "contractor",
  "scope",
  "comment",
  "attachment",
  "activity",
  "alert",
  "contact",
  "lead",
  "door_visit",
  "sms",
  "client_link",
  "calendar",
] as const;

export type AuditAction = "created" | "updated" | "deleted";

export interface AuditEvent {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string | null;
  action: AuditAction;
  entityKind: (typeof auditKinds)[number] | string;
  entityId: string;
  projectId: string | null;
  subject: string;
  changedFields: string[];
  occurredAt: string;
}
