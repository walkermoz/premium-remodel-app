import "server-only";
import type { WorkspaceUser } from "./auth";
import type { AuditAction } from "./audit";
import { supabaseAdmin } from "./supabase/server";

export async function recordAuditEvent(
  user: WorkspaceUser,
  {
    action,
    entityKind,
    subject,
    entityId = user.id,
    projectId = null,
    beforeData = null,
    afterData = null,
  }: {
    action: AuditAction;
    entityKind: string;
    subject: string;
    entityId?: string;
    projectId?: string | null;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabaseAdmin().from("remodel_audit_events").insert({
    organization_id: user.organizationId,
    actor_id: user.id,
    actor_name: user.name,
    actor_email: user.email,
    action,
    entity_kind: entityKind,
    entity_id: entityId,
    project_id: projectId,
    subject,
    before_data: beforeData,
    after_data: afterData,
  });
  if (error) throw error;
}
