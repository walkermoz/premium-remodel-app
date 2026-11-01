import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { enqueueWorkflowEvent } from "@/lib/workflows/events";
import { unsealOrganizationValue } from "@/lib/organization-secrets";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import {
  sameWebPolicyUrl,
  webhookConsentEnvelopeSchema,
} from "@/lib/webhook-sms-consent";

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
      .select(
        "id,organization_id,workflow_id,enabled,auth_mode,auth_header,auth_secret_ciphertext",
      )
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
    if (hook.data.auth_mode !== "none") {
      if (!hook.data.auth_secret_ciphertext)
        throw new HttpError(503, "Webhook authentication is not configured.");
      const secret = unsealOrganizationValue(
        hook.data.auth_secret_ciphertext,
        hook.data.organization_id,
        hook.data.id,
      );
      const headerName =
        hook.data.auth_header ||
        (hook.data.auth_mode === "hmac_sha256"
          ? "x-servicebuddy-signature"
          : "authorization");
      const received = request.headers.get(headerName) || "";
      const expected =
        hook.data.auth_mode === "hmac_sha256"
          ? `sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`
          : secret;
      const receivedBytes = Buffer.from(received);
      const expectedBytes = Buffer.from(expected);
      if (
        receivedBytes.length !== expectedBytes.length ||
        !timingSafeEqual(receivedBytes, expectedBytes)
      )
        throw new HttpError(401, "Webhook authentication failed.");
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new HttpError(400, "Webhook payload must be a JSON object.");
    const consent = webhookConsentEnvelopeSchema.parse(payload);
    if (
      consent.smsAppointmentOptIn === true ||
      consent.smsMarketingOptIn === true
    ) {
      const evidence = consent.smsConsentEvidence;
      if (!evidence)
        throw new HttpError(
          400,
          "SMS opt-in requires a complete smsConsentEvidence snapshot from the form.",
        );
      if (
        evidence.appointment !== (consent.smsAppointmentOptIn === true) ||
        evidence.marketing !== (consent.smsMarketingOptIn === true)
      )
        throw new HttpError(
          400,
          "SMS consent evidence must match the submitted appointment and marketing choices.",
        );
      if (Date.parse(evidence.capturedAt) > Date.now() + 5 * 60_000)
        throw new HttpError(400, "SMS consent time cannot be in the future.");
      const business = await getBusinessConfigForOrganization(
        hook.data.organization_id,
      );
      const policy = business.compliance;
      if (!policy.smsPolicyVersion || !policy.privacyUrl || !policy.termsUrl)
        throw new HttpError(
          409,
          "Configure the business SMS policy, privacy URL, and terms URL before accepting SMS consent.",
        );
      if (
        evidence.policyVersion !== policy.smsPolicyVersion ||
        !sameWebPolicyUrl(evidence.privacyUrl, policy.privacyUrl) ||
        !sameWebPolicyUrl(evidence.termsUrl, policy.termsUrl)
      )
        throw new HttpError(
          400,
          "SMS consent evidence does not match this business’s current saved policy.",
        );
      if (business.profile.website) {
        const configuredOrigin = new URL(business.profile.website).origin;
        if (new URL(evidence.origin).origin !== configuredOrigin)
          throw new HttpError(
            400,
            "SMS consent evidence must come from this business’s configured website.",
          );
      }
    }
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
