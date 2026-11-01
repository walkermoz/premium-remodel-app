import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import { sealOrganizationValue } from "@/lib/organization-secrets";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

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
      .select(
        "enabled,created_at,rotated_at,last_used_at,auth_mode,auth_header,auth_secret_ciphertext",
      )
      .eq("organization_id", user.organizationId)
      .eq("workflow_id", workflowId)
      .maybeSingle();
    if (hook.error) throw hook.error;
    return Response.json(
      {
        configured: Boolean(hook.data),
        webhook: hook.data
          ? {
              enabled: hook.data.enabled,
              createdAt: hook.data.created_at,
              rotatedAt: hook.data.rotated_at,
              lastUsedAt: hook.data.last_used_at,
              authMode: hook.data.auth_mode || "none",
              authHeader: hook.data.auth_header || "",
              hasAdditionalAuthentication: Boolean(
                hook.data.auth_secret_ciphertext,
              ),
            }
          : null,
      },
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
    await requireOrganizationCapability(user, "workflows.manage");
    const { id } = await context.params;
    const workflowId = z.uuid().parse(id);
    const raw = await request.text();
    const authInput = z
      .object({
        authMode: z.enum(["none", "header", "hmac_sha256"]).optional(),
        authHeader: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,120}$/)
          .optional(),
        authSecret: z.string().min(12).max(10_000).optional(),
      })
      .parse(raw ? JSON.parse(raw) : {});
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
    const current = await supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .select("id,auth_mode,auth_header,auth_secret_ciphertext")
      .eq("organization_id", user.organizationId)
      .eq("workflow_id", workflowId)
      .maybeSingle();
    if (current.error) throw current.error;
    const hookId = current.data?.id || randomUUID();
    const authMode = authInput.authMode || current.data?.auth_mode || "none";
    const authHeader =
      authMode === "none"
        ? null
        : authInput.authHeader ||
          current.data?.auth_header ||
          (authMode === "hmac_sha256"
            ? "x-servicebuddy-signature"
            : "authorization");
    const authSecretCiphertext =
      authMode === "none"
        ? null
        : authInput.authSecret
          ? sealOrganizationValue(
              authInput.authSecret,
              user.organizationId,
              hookId,
            )
          : current.data?.auth_secret_ciphertext;
    if (authMode !== "none" && !authSecretCiphertext)
      throw new HttpError(
        400,
        "Enter the shared secret used to authenticate webhook requests.",
      );
    const saved = await supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .upsert(
        {
          id: hookId,
          organization_id: user.organizationId,
          workflow_id: workflowId,
          token_hash: tokenHash,
          enabled: true,
          created_by: user.id,
          rotated_at: now,
          auth_mode: authMode,
          auth_header: authHeader,
          auth_secret_ciphertext: authSecretCiphertext,
        },
        { onConflict: "organization_id,workflow_id" },
      );
    if (saved.error) throw saved.error;
    return Response.json(
      {
        url: `${appOrigin(request)}/api/workflows/inbound/${token}`,
        message:
          "Copy this URL now. For security, the token will not be shown again.",
        authMode,
        authHeader,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
