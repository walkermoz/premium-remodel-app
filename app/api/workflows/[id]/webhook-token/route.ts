import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWorkflow } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const { id } = await context.params;
    const workflowId = z.uuid().parse(id);
    await getWorkflow(user.organizationId, workflowId);
    const hook = await supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .select("enabled,created_at,rotated_at,last_used_at")
      .eq("organization_id", user.organizationId)
      .eq("workflow_id", workflowId)
      .maybeSingle();
    if (hook.error) throw hook.error;
    return Response.json(
      { configured: Boolean(hook.data), webhook: hook.data || null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can rotate webhook URLs.");
    const { id } = await context.params;
    const workflowId = z.uuid().parse(id);
    const workflow = await getWorkflow(user.organizationId, workflowId);
    const publishedHasWebhook = workflow.published?.graph.nodes.some(
      (node) => node.type === "trigger.inboundWebhook",
    );
    if (!publishedHasWebhook)
      throw new HttpError(
        409,
        "Publish this workflow with an Inbound webhook trigger first.",
      );
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date().toISOString();
    const saved = await supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .upsert(
        {
          organization_id: user.organizationId,
          workflow_id: workflowId,
          token_hash: tokenHash,
          enabled: true,
          created_by: user.id,
          rotated_at: now,
        },
        { onConflict: "organization_id,workflow_id" },
      );
    if (saved.error) throw saved.error;
    return Response.json(
      {
        url: `${appOrigin(request)}/api/workflows/inbound/${token}`,
        message:
          "Copy this URL now. For security, the token will not be shown again.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
