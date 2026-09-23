import { apiError, HttpError, requireUser } from "@/lib/auth";
import type { AuditEvent } from "@/lib/audit";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const pageSize = 25;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can view workspace history.",
      );

    const value = new URL(request.url).searchParams.get("offset") || "0";
    if (!/^\d{1,5}$/.test(value))
      throw new HttpError(400, "Invalid history offset.");
    const offset = Number(value);
    if (offset > 10_000) throw new HttpError(400, "Invalid history offset.");

    const { data, error } = await (
      await supabaseServer()
    )
      .from("remodel_audit_events")
      .select(
        "id,actor_id,actor_name,actor_email,action,entity_kind,entity_id,project_id,subject,before_data,after_data,occurred_at",
      )
      .eq("organization_id", user.organizationId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize);
    if (error) throw error;

    const entries: AuditEvent[] = data.slice(0, pageSize).map((entry) => {
      const before = (entry.before_data || {}) as Record<string, unknown>;
      const after = (entry.after_data || {}) as Record<string, unknown>;
      const changedFields =
        entry.action === "updated"
          ? [...new Set([...Object.keys(before), ...Object.keys(after)])]
              .filter(
                (key) =>
                  ![
                    "id",
                    "createdAt",
                    "updatedAt",
                    "authorId",
                    "lastEditedById",
                    "lastEditedByName",
                    "lastEditedAt",
                    "durationMinutes",
                  ].includes(key) &&
                  JSON.stringify(before[key]) !== JSON.stringify(after[key]),
              )
              .slice(0, 8)
          : [];
      return {
        id: entry.id,
        actorId: entry.actor_id,
        actorName: entry.actor_name,
        actorEmail: entry.actor_email,
        action: entry.action,
        entityKind: entry.entity_kind,
        entityId: entry.entity_id,
        projectId: entry.project_id,
        subject: entry.subject,
        changedFields,
        occurredAt: entry.occurred_at,
      };
    });

    return Response.json(
      { entries, hasMore: data.length > pageSize },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
