import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import {
  finishWebsiteLeadRun,
  startWebsiteLeadRun,
  type AutomationRunStep,
} from "@/lib/automation-runs";
import { getWebsiteLeadAutomation } from "@/lib/automation-store";
import { sendDiscordLeadNotification } from "@/lib/discord-leads";
import { sendWebsiteLeadAcknowledgement } from "@/lib/lead-email";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contact, Lead } from "@/lib/types";
import { parseWebsiteLead } from "@/lib/website-lead-input";

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
  expected: {
    name: string;
    email: string;
    phone: string;
    project: string;
    description: string;
  },
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

async function findMatchingContact(
  organizationId: string,
  email: string,
  phone: string,
): Promise<Contact | null> {
  const admin = supabaseAdmin();
  for (const [field, value] of [
    ["email", email],
    ["phone", phone],
  ] as const) {
    if (!value) continue;
    const { data, error } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("kind", "contact")
      .eq(`data->>${field}`, value)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.data as Contact;
  }
  return null;
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
      project: data.project || "Project not specified",
      description: data.project_description || "",
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
    const matchedContact = automation.matchExistingContacts
      ? await findMatchingContact(organizationId, email, phone)
      : null;
    const now = new Date().toISOString();
    const contact: Contact = matchedContact || {
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
      status: automation.initialStage,
      disposition: automation.initialDisposition,
      approvalState: "none",
      smsAppointmentOptIn: data.sms_appointment_opt_in,
      smsMarketingOptIn: data.sms_marketing_opt_in,
      otherSubmittedFields,
      ...(leadAttribution ? { leadAttribution } : {}),
      source: automation.sourceLabel,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const records = [
      ...(!matchedContact ? [{ kind: "contact", entity: contact }] : []),
      { kind: "lead", entity: lead },
    ];
    const { error: insertError } = await admin.from("remodel_records").insert(
      records.map(({ kind, entity }) => ({
        id: entity.id,
        organization_id: organizationId,
        created_by: null,
        updated_by: null,
        kind,
        project_id: null,
        data: entity,
        updated_at: now,
      })),
    );
    if (insertError) {
      if (
        data.submission_id &&
        insertError.code === "23505" &&
        (await existingSubmission(
          organizationId,
          data.submission_id,
          duplicateInput,
        ))
      )
        return cors(Response.json({ received: true, duplicate: true }), origin);
      throw insertError;
    }

    const runSteps: AutomationRunStep[] = [
      {
        key: "contact",
        label: "Customer contact",
        status: matchedContact ? "reused" : "created",
      },
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
    const runId = await startWebsiteLeadRun({
      organizationId,
      leadId: lead.id,
      subject: lead.name,
      project: lead.project,
      steps: runSteps,
    });

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
