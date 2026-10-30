import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { sendDiscordLeadNotification } from "@/lib/discord-leads";
import { sendWebsiteLeadAcknowledgement } from "@/lib/lead-email";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contact, Lead } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const retryInput = z.object({ step: z.enum(["email", "team"]) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can retry automations.");
    await limitAttempts(`automation-retry:${user.id}`, 20);

    const { id } = await context.params;
    const runId = z.uuid().parse(id);
    const { step } = retryInput.parse(await request.json());
    const admin = supabaseAdmin();
    const { data: run, error: runError } = await admin
      .from("remodel_automation_runs")
      .select("lead_id,steps")
      .eq("organization_id", user.organizationId)
      .eq("automation_key", "website-lead-intake")
      .eq("id", runId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) throw new HttpError(404, "Workflow run not found.");
    const action = (run.steps as { key: string; status: string }[]).find(
      (entry) => entry.key === step,
    );
    if (!action || !["failed", "not_configured"].includes(action.status))
      throw new HttpError(
        409,
        "This action is not safe to retry. Refresh the run and check its status.",
      );
    if (!run.lead_id)
      throw new HttpError(409, "The original lead is no longer available.");

    const { data: leadRow, error: leadError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", user.organizationId)
      .eq("kind", "lead")
      .eq("id", run.lead_id)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!leadRow) throw new HttpError(409, "The original lead was removed.");
    const lead = leadRow.data as Lead & {
      discordNotification?: { status: string };
    };
    const priorDelivery =
      step === "email"
        ? lead.emailAcknowledgement?.status
        : lead.discordNotification?.status;
    if (priorDelivery === "sent" || priorDelivery === "unknown")
      throw new HttpError(
        409,
        "Delivery may already have occurred. Check the message before retrying.",
      );

    const { data: contactRow, error: contactError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", user.organizationId)
      .eq("kind", "contact")
      .eq("id", lead.contactId)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contactRow)
      throw new HttpError(409, "The linked customer contact was removed.");
    const contact = contactRow.data as Contact;
    if (step === "email" && !contact.email)
      throw new HttpError(409, "Add a customer email before retrying.");

    const { data: claimed, error: claimError } = await admin.rpc(
      "remodel_claim_automation_retry",
      {
        p_organization_id: user.organizationId,
        p_run_id: runId,
        p_step_key: step,
      },
    );
    if (claimError) throw claimError;
    if (!claimed)
      throw new HttpError(409, "This action is already being retried.");

    let result:
      | Awaited<ReturnType<typeof sendWebsiteLeadAcknowledgement>>
      | Awaited<ReturnType<typeof sendDiscordLeadNotification>>;
    try {
      result =
        step === "email"
          ? await sendWebsiteLeadAcknowledgement({
              organizationId: user.organizationId,
              recipientEmail: contact.email,
              firstName: contact.firstName,
            })
          : await sendDiscordLeadNotification({
              first_name: contact.firstName,
              last_name: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              address: contact.address,
              zip: contact.zip,
              project: lead.project,
              project_description: lead.projectDescription,
            });
    } catch {
      result = {
        status: "unknown",
        attemptedAt: new Date().toISOString(),
        detail: "Delivery could not be confirmed",
      };
    }

    const { data: finished, error: finishError } = await admin.rpc(
      "remodel_finish_automation_retry",
      {
        p_organization_id: user.organizationId,
        p_run_id: runId,
        p_step_key: step,
        p_result: result,
      },
    );
    if (finishError) throw finishError;
    if (!finished)
      throw new HttpError(409, "Could not record the retry outcome.");
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
