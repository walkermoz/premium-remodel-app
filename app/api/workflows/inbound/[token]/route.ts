import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { enqueueWorkflowEvent } from "@/lib/workflows/events";

export const runtime = "nodejs";
export const maxDuration = 15;

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const idempotencySchema = z.string().trim().min(8).max(240);

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new HttpError(415, "Send a JSON request body.");
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 256_000)
      throw new HttpError(413, "Webhook payloads must be 256 KB or smaller.");
    const { token: rawToken } = await context.params;
    const token = tokenSchema.parse(rawToken);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await limitAttempts(`workflow-inbound:${tokenHash}`, 120);
    const hook = await supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .select("id,organization_id,workflow_id,enabled")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (hook.error) throw hook.error;
    if (!hook.data?.enabled) throw new HttpError(404, "Webhook not found.");
    const idempotencyKey = idempotencySchema.parse(
      request.headers.get("idempotency-key"),
    );
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 256_000)
      throw new HttpError(413, "Webhook payloads must be 256 KB or smaller.");
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new HttpError(400, "Webhook payload must be a JSON object.");
    const eventId = randomUUID();
    const queued = await enqueueWorkflowEvent({
      organizationId: hook.data.organization_id,
      type: "webhook.inbound.received",
      objectType: "event",
      objectId: eventId,
      actor: { type: "integration", id: hook.data.id, name: "Inbound webhook" },
      idempotencyKey: `inbound:${hook.data.id}:${idempotencyKey}`,
      payload: {
        ...(payload as Record<string, unknown>),
        targetWorkflowId: hook.data.workflow_id,
        webhookId: hook.data.id,
      },
    });
    await supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", hook.data.id);
    return Response.json(
      { received: true, eventId: queued.event.id, duplicate: !queued.created },
      {
        status: queued.created ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
