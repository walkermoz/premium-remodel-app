import "server-only";
import { supabaseAdmin } from "./supabase/server";
import {
  deliverWebsiteLeadCopy,
  type WebsiteLeadDeliveryJob,
} from "./website-lead-delivery";

export async function processWebsiteLeadDeliveries(deliveryId?: string) {
  const admin = supabaseAdmin();
  const claimed = await admin.rpc("remodel_claim_website_lead_deliveries", {
    p_delivery_id: deliveryId || null,
    p_limit: deliveryId ? 1 : 4,
  });
  // Backend may be deployed before the additive migration. Legacy intake and
  // its browser delivery must continue working during that rollout window.
  if (claimed.error?.code === "PGRST202")
    return { processed: 0, delivered: 0, retryScheduled: 0, needsAttention: 0 };
  if (claimed.error) throw claimed.error;
  const jobs = (claimed.data?.jobs || []) as WebsiteLeadDeliveryJob[];
  const result = {
    processed: jobs.length,
    delivered: 0,
    retryScheduled: 0,
    needsAttention: Number(claimed.data?.needsAttention || 0),
  };
  // Independent jobs can finish together without holding up website workflows.
  const outcomes = await Promise.allSettled(
    jobs.map(async (job) => {
      const outcome = await deliverWebsiteLeadCopy(job, {
        primaryOrganizationId: process.env.SUPABASE_ORGANIZATION_ID,
      });
      const finished = await admin.rpc("remodel_finish_website_lead_delivery", {
        p_id: job.id,
        p_claim_token: job.claim_token,
        p_status: outcome.status,
        p_error: outcome.error || null,
        p_available_at: outcome.availableAt || null,
      });
      if (finished.error) throw finished.error;
      if (finished.data !== true)
        throw new Error(
          "Website delivery claim was lost; review the saved job before resending.",
        );
      if (outcome.status === "delivered") result.delivered += 1;
      else if (outcome.status === "retry_wait") result.retryScheduled += 1;
      else result.needsAttention += 1;
    }),
  );
  if (result.needsAttention)
    console.error("Website GoHighLevel delivery needs review.", {
      count: result.needsAttention,
    });
  // Wait for every claimed job before reporting an error. An early rejected
  // Promise.all would let the serverless task end while other writes run.
  if (outcomes.some((outcome) => outcome.status === "rejected"))
    throw new Error(
      "Could not record every website delivery outcome; saved claims require recovery or review.",
    );
  return result;
}
