import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import {
  finishWebsiteLeadRun,
  type AutomationRunStep,
} from "@/lib/automation-runs";
import { getWebsiteLeadAutomation } from "@/lib/automation-store";
import { sendDiscordLeadNotification } from "@/lib/discord-leads";
import { sendWebsiteLeadAcknowledgement } from "@/lib/lead-email";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contact, Lead } from "@/lib/types";
import { parseWebsiteLead } from "@/lib/website-lead-input";
import { websiteSmsConsentEvidence } from "@/lib/sms-consent";

export const runtime = "nodejs";

const productionOrigins = new Set([
  "https://premiumremodel.com",
  "https://www.premiumremodel.com",
  "https://plhi.vercel.app",
  "https://servicebuddy-ui.vercel.app",
]);
const previewOrigin =
  /^https:\/\/plhi(?:-[a-z0-9-]+)?-walkermozs-projects\.vercel\.app$/;
const dashboardPreviewOrigin =
  /^https:\/\/servicebuddy(?:-ui)?-[a-z0-9-]+-walkermozs-projects\.vercel\.app$/;

function allowedOrigin(origin: string) {
  return (
    productionOrigins.has(origin) ||
    previewOrigin.test(origin) ||
    dashboardPreviewOrigin.test(origin) ||
    (process.env.NODE_ENV !== "production" &&
      /^http:\/\/localhost:\d+$/.test(origin))
  );
}

function cors(response: Response, origin: string) {
  if (allowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function existingSubmission(
  organizationId: string,
  submissionId: string,
  expected: NonNullable<Lead["websiteSubmission"]>,
): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: leadRow, error: leadError } = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "lead")
    .eq("id", submissionId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!leadRow) return false;
  const lead = leadRow.data as Lead;
  if (lead.websiteSubmission) {
    if (!isDeepStrictEqual(lead.websiteSubmission, expected))
      throw new HttpError(
        409,
        "Submission ID was already used for another lead.",
      );
    return true;
  }
  const { data: contactRow, error: contactError } = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "contact")
    .eq("id", lead.contactId)
    .maybeSingle();
  if (contactError) throw contactError;
  const contact = contactRow?.data as Contact | undefined;
  if (
    !contact ||
    lead.name !== expected.name ||
    lead.project !== expected.project ||
    lead.projectDescription !== expected.description ||
    contact.email.toLowerCase() !== expected.email ||
    contact.phone !== expected.phone
  )
    throw new HttpError(
      409,
      "Submission ID was already used for another lead.",
    );
  return true;
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigin(origin))
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  return cors(
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    }),
    origin,
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigin(origin))
    return Response.json({ error: "Origin not allowed." }, { status: 403 });

  let response: Response;
  try {
    const organizationId = process.env.SUPABASE_ORGANIZATION_ID;
    if (!organizationId || !z.uuid().safeParse(organizationId).success)
      throw new Error("Lead intake organization is not configured.");

    const { data, otherSubmittedFields, leadAttribution } = parseWebsiteLead(
      await request.json(),
    );
    const firstName =
      data.first_name ||
      (data.last_name ? "" : data.email || data.phone || "Website lead");
    const lastName = data.last_name || "";
    const name = `${firstName} ${lastName}`.trim();
    const email = data.email?.toLowerCase() || "";
    const phone = data.phone || "";
    const duplicateInput = {
      name,
      email,
      phone,
      zip: data.zip || "",
      address: data.address || "",
      project: data.project || "Project not specified",
      description: data.project_description || "",
      smsAppointmentOptIn: data.sms_appointment_opt_in,
      smsMarketingOptIn: data.sms_marketing_opt_in,
      otherSubmittedFields,
      ...(leadAttribution ? { leadAttribution } : {}),
    };
    if (
      data.submission_id &&
      (await existingSubmission(
        organizationId,
        data.submission_id,
        duplicateInput,
      ))
    )
      return cors(Response.json({ received: true, duplicate: true }), origin);
    const forwarded =
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";
    const ip = forwarded.split(",")[0].trim().slice(0, 80);
    const limits = [limitAttempts(`website-lead:ip:${ip}`, 12)];
    if (data.email)
      limits.push(
        limitAttempts(`website-lead:email:${data.email.toLowerCase()}`, 4),
      );
    await Promise.all(limits);

    const admin = supabaseAdmin();
    const automation = await getWebsiteLeadAutomation(organizationId);
    const now = new Date().toISOString();
    const contact: Contact = {
      id: randomUUID(),
      firstName,
      lastName,
      name,
      email,
      phone,
      zip: data.zip || "",
      address: data.address || "",
      source: automation.sourceLabel,
      createdAt: now,
      updatedAt: now,
    };
    const lead: Lead = {
      id: data.submission_id || randomUUID(),
      contactId: contact.id,
      name,
      project: duplicateInput.project,
      projectDescription: duplicateInput.description,
      websiteSubmission: duplicateInput,
      status: automation.initialStage,
      disposition: automation.initialDisposition,
      approvalState: "none",
      smsAppointmentOptIn: data.sms_appointment_opt_in,
      smsMarketingOptIn: data.sms_marketing_opt_in,
      smsConsentEvidence: websiteSmsConsentEvidence({
        capturedAt: now,
        origin,
        appointment: data.sms_appointment_opt_in,
        marketing: data.sms_marketing_opt_in,
      }),
      otherSubmittedFields,
      ...(leadAttribution ? { leadAttribution } : {}),
      source: automation.sourceLabel,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const runSteps: AutomationRunStep[] = [
      { key: "contact", label: "Customer contact", status: "created" },
      { key: "lead", label: "Lead", status: "created" },
      {
        key: "email",
        label: "Customer confirmation",
        status:
          automation.sendAcknowledgement && data.email ? "pending" : "skipped",
      },
      {
        key: "team",
        label: "Team notification",
        status: automation.sendTeamNotification ? "pending" : "skipped",
      },
    ];
    const { data: capture, error: captureError } = await admin
      .rpc("remodel_capture_website_lead", {
        p_organization_id: organizationId,
        p_contact: contact,
        p_lead: lead,
        p_match_existing: automation.matchExistingContacts,
        p_steps: runSteps,
      })
      .single();
    if (captureError) {
      if (
        data.submission_id &&
        captureError.code === "23505" &&
        (await existingSubmission(
          organizationId,
          data.submission_id,
          duplicateInput,
        ))
      )
        return cors(Response.json({ received: true, duplicate: true }), origin);
      throw captureError;
    }
    const captured = capture as {
      contact_id: string;
      run_id: string;
      contact_reused: boolean;
    };
    lead.contactId = captured.contact_id;
    runSteps[0].status = captured.contact_reused ? "reused" : "created";
    const runId = captured.run_id;

    const [notificationResult, acknowledgementResult] =
      await Promise.allSettled([
        automation.sendTeamNotification
          ? sendDiscordLeadNotification(data)
          : Promise.resolve({
              status: "skipped" as const,
              attemptedAt: new Date().toISOString(),
              detail: "Disabled by automation",
            }),
        automation.sendAcknowledgement
          ? sendWebsiteLeadAcknowledgement({
              organizationId,
              recipientEmail: data.email,
              firstName: data.first_name,
            })
          : Promise.resolve({
              status: "skipped" as const,
              attemptedAt: new Date().toISOString(),
              detail: "Disabled by automation",
            }),
      ]);
    const notification =
      notificationResult.status === "fulfilled"
        ? notificationResult.value
        : {
            status: "unknown" as const,
            attemptedAt: new Date().toISOString(),
            detail: "Notification delivery could not be confirmed",
          };
    const emailAcknowledgement =
      acknowledgementResult.status === "fulfilled"
        ? acknowledgementResult.value
        : {
            status: "unknown" as const,
            attemptedAt: new Date().toISOString(),
            detail: "Email delivery could not be confirmed",
          };
    runSteps[2] = {
      key: "email",
      label: "Customer confirmation",
      status: emailAcknowledgement.status,
      ...(emailAcknowledgement.detail
        ? { detail: emailAcknowledgement.detail }
        : {}),
    };
    runSteps[3] = {
      key: "team",
      label: "Team notification",
      status: notification.status,
      ...(notification.detail ? { detail: notification.detail } : {}),
    };
    const updatedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("remodel_records")
      .update({
        data: {
          ...lead,
          discordNotification: notification,
          emailAcknowledgement,
          updatedAt,
        },
        updated_at: updatedAt,
      })
      .eq("organization_id", organizationId)
      .eq("kind", "lead")
      .eq("id", lead.id);
    if (updateError)
      console.error("Could not store the lead notification status.");
    if (updateError)
      runSteps.push({
        key: "record",
        label: "Delivery status record",
        status: "failed",
        detail: "The lead was saved, but its delivery status was not updated.",
      });
    await finishWebsiteLeadRun({ organizationId, runId, steps: runSteps });

    response = Response.json({ received: true }, { status: 201 });
  } catch (error) {
    response = apiError(error);
  }
  return cors(response, origin);
}
