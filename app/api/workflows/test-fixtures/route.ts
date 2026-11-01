import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth";
import {
  workflowEventSchema,
  workflowObjectTypeSchema,
} from "@/lib/workflows/schema";
import { redactWorkflowValue } from "@/lib/workflows/redaction";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const primaryObjectSchema = z.enum([
  "contact",
  "lead",
  "quote",
  "project",
  "item",
]);

const querySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("recent") }),
  z.object({ mode: z.literal("event"), id: z.uuid() }),
  z.object({ mode: z.literal("objects"), objectType: primaryObjectSchema }),
  z.object({
    mode: z.literal("object"),
    objectType: primaryObjectSchema,
    id: z.string().trim().min(1).max(160),
  }),
]);

function recordKind(objectType: z.infer<typeof primaryObjectSchema>) {
  return objectType === "item" ? "task" : objectType;
}

function recordLabel(data: Record<string, unknown>, fallback: string) {
  return String(
    data.name ||
      data.title ||
      data.project ||
      data.projectName ||
      data.clientName ||
      data.email ||
      fallback,
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const url = new URL(request.url);
    const query = querySchema.parse({
      mode: url.searchParams.get("mode"),
      id: url.searchParams.get("id") || undefined,
      objectType: url.searchParams.get("objectType") || undefined,
    });
    const admin = supabaseAdmin();

    if (query.mode === "recent") {
      const result = await admin
        .from("remodel_workflow_events")
        .select("id,event_type,object_type,object_id,occurred_at,payload")
        .eq("organization_id", user.organizationId)
        .order("occurred_at", { ascending: false })
        .limit(30);
      if (result.error) throw result.error;
      return Response.json(
        {
          events: result.data.map((event) => ({
            id: event.id,
            type: event.event_type,
            objectType: event.object_type,
            objectId: event.object_id,
            occurredAt: event.occurred_at,
            label: recordLabel(
              (event.payload || {}) as Record<string, unknown>,
              `${event.event_type} · ${event.object_id}`,
            ),
          })),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (query.mode === "event") {
      const result = await admin
        .from("remodel_workflow_events")
        .select(
          "id,schema_version,event_type,actor,object_type,object_id,contact_id,occurred_at,correlation_id,causation_id,idempotency_key,payload",
        )
        .eq("organization_id", user.organizationId)
        .eq("id", query.id)
        .single();
      if (result.error) throw result.error;
      const row = result.data;
      const event = workflowEventSchema.parse({
        id: row.id,
        schemaVersion: row.schema_version,
        type: row.event_type,
        organizationId: user.organizationId,
        actor: redactWorkflowValue(row.actor),
        objectType: row.object_type,
        objectId: row.object_id,
        ...(row.contact_id ? { contactId: row.contact_id } : {}),
        occurredAt: row.occurred_at,
        correlationId: row.correlation_id,
        ...(row.causation_id ? { causationId: row.causation_id } : {}),
        idempotencyKey: row.idempotency_key,
        payload: redactWorkflowValue(row.payload),
      });
      return Response.json(
        { event },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (query.mode === "objects") {
      const result = await admin
        .from("remodel_records")
        .select("id,data,updated_at")
        .eq("organization_id", user.organizationId)
        .eq("kind", recordKind(query.objectType))
        .order("updated_at", { ascending: false })
        .limit(50);
      if (result.error) throw result.error;
      return Response.json(
        {
          objects: result.data.map((record) => ({
            id: record.id,
            label: recordLabel(
              (record.data || {}) as Record<string, unknown>,
              record.id,
            ),
            updatedAt: record.updated_at,
          })),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    workflowObjectTypeSchema.parse(query.objectType);
    const result = await admin
      .from("remodel_records")
      .select("id,data,updated_at")
      .eq("organization_id", user.organizationId)
      .eq("kind", recordKind(query.objectType))
      .eq("id", query.id)
      .single();
    if (result.error) throw result.error;
    return Response.json(
      {
        object: {
          id: result.data.id,
          objectType: query.objectType,
          data: redactWorkflowValue(result.data.data),
          updatedAt: result.data.updated_at,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
