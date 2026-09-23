import "server-only";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "./supabase/server";

export type LeadWebhookPayload = {
  event: "lead.created";
  leadId: string;
  contactId: string;
  name: string;
  project: string;
  projectDescription: string;
  status: string;
  disposition: string;
  source: string;
  submittedAt: string;
  email?: string;
  phone?: string;
  address?: string;
  zip?: string;
};

export async function readLeadWebhookConfig(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_settings")
    .select("lead_webhook_url,lead_webhook_secret")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return {
    url: (data?.lead_webhook_url as string | null) || null,
    secret: (data?.lead_webhook_secret as string | null) || null,
  };
}

export async function saveLeadWebhookConfig(
  organizationId: string,
  userId: string,
  url: string | null,
  secret: string | null,
) {
  const { data: existing, error: readError } = await supabaseAdmin()
    .from("remodel_settings")
    .select("generation_default_model")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (readError) throw readError;

  const row = {
    organization_id: organizationId,
    generation_default_model:
      existing?.generation_default_model || "google/gemini-2.5-flash-image",
    lead_webhook_url: url,
    lead_webhook_secret: secret,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin()
    .from("remodel_settings")
    .upsert(row, { onConflict: "organization_id" });
  if (error) throw error;
}

export async function dispatchLeadCreatedWebhook(
  organizationId: string,
  payload: LeadWebhookPayload,
) {
  const config = await readLeadWebhookConfig(organizationId);
  if (!config.url) return { status: "not_configured" as const };

  const body = JSON.stringify({
    ...payload,
    deliveredAt: new Date().toISOString(),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "PremiumRemodel-ServiceBuddy/1.0",
    "X-ServiceBuddy-Event": "lead.created",
  };
  if (config.secret) {
    headers["X-ServiceBuddy-Signature"] = createHmac("sha256", config.secret)
      .update(body)
      .digest("hex");
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok)
      return {
        status: "failed" as const,
        httpStatus: response.status,
      };
    return { status: "delivered" as const, httpStatus: response.status };
  } catch (error) {
    console.error(
      "Lead webhook delivery failed",
      error instanceof Error ? error.name : "WebhookError",
    );
    return { status: "failed" as const };
  }
}
