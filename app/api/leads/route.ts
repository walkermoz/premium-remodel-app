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
import { recordWebsiteLeadDeliveries } from "@/lib/lead-communication-log";
import { sendWebsiteLeadSmsAcknowledgement } from "@/lib/lead-sms";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contact, Lead } from "@/lib/types";
import { parseWebsiteLead } from "@/lib/website-lead-input";
import { websiteSmsConsentEvidence } from "@/lib/sms-consent";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { readClientQuoteSource } from "@/lib/client-quote";
import { workspaceActionLabels } from "@/lib/workspace-objects";
import {
  createWorkflowEvent,
  currentWorkflowRolloutMode,
  recordWorkflowShadowEvent,
} from "@/lib/workflows/events";
import { processWorkflowEvent } from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const websiteLeadActions = workspaceActionLabels.websiteLead;

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
    const rawInput = await request.json();
    const portalToken =
      rawInput &&
      typeof rawInput === "object" &&
      !Array.isArray(rawInput) &&
      typeof rawInput.client_portal_token === "string"
        ? rawInput.client_portal_token
        : "";
    const portalSource = portalToken
      ? await readClientQuoteSource(portalToken, { recordView: false })
      : null;
    if (portalToken && !portalSource)
      throw new HttpError(403, "This client portal link is no longer valid.");
    const organizationId =
      portalSource?.organizationId || process.env.SUPABASE_ORGANIZATION_ID;
    if (!organizationId || !z.uuid().safeParse(organizationId).success)
      throw new Error("Lead intake organization is not configured.");

    const { data, otherSubmittedFields, leadAttribution } =
      parseWebsiteLead(rawInput);
    const business = await getBusinessConfigForOrganization(organizationId);
    const smsPolicyReady = Boolean(
      business.compliance.smsPolicyVersion &&
      business.compliance.privacyUrl &&
      business.compliance.termsUrl,
    );
    if (
      (data.sms_appointment_opt_in || data.sms_marketing_opt_in) &&
      !smsPolicyReady
    )
      throw new HttpError(
        400,
        "Text consent is not configured for this organization.",
      );
    const consentSource = (() => {
      try {
        return `${new URL(business.profile.website).hostname.replace(/^www\./, "")} consultation form`;
      } catch {
        return `${business.profile.name} client request form`;
      }
    })();
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
    const workflowMode = currentWorkflowRolloutMode();
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
      ...(smsPolicyReady
        ? {
            smsConsentEvidence: websiteSmsConsentEvidence(
              {
                capturedAt: now,
                origin,
                appointment: data.sms_appointment_opt_in,
                marketing: data.sms_marketing_opt_in,
              },
              {
                source: consentSource,
                policyVersion: business.compliance.smsPolicyVersion,
                privacyUrl: business.compliance.privacyUrl,
                termsUrl: business.compliance.termsUrl,
              },
            ),
          }
        : {}),
      otherSubmittedFields,
      ...(leadAttribution ? { leadAttribution } : {}),
      source: automation.sourceLabel,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    if (
      workflowMode === "execute" &&
      (!automation.sendAcknowledgement || !email)
    )
      lead.emailAcknowledgement = {
        status: "skipped",
        attemptedAt: now,
        detail: automation.sendAcknowledgement
          ? "No email address"
          : "Disabled by automation",
      };
    if (
      workflowMode === "execute" &&
      (!automation.sendSmsAcknowledgement ||
        !data.sms_appointment_opt_in ||
        !phone)
    )
      lead.smsAcknowledgement = {
        status: "skipped",
        attemptedAt: now,
        detail: !automation.sendSmsAcknowledgement
          ? "Disabled by automation"
          : !data.sms_appointment_opt_in
            ? "Customer did not select appointment and project texts"
            : "No phone number",
      };
    const runSteps: AutomationRunStep[] = [
      { key: "contact", label: websiteLeadActions.contact, status: "created" },
      { key: "lead", label: websiteLeadActions.lead, status: "created" },
      {
        key: "email",
        label: websiteLeadActions.email,
        status:
          automation.sendAcknowledgement && data.email ? "pending" : "skipped",
      },
      {
        key: "sms",
        label: websiteLeadActions.sms,
        status:
          automation.sendSmsAcknowledgement && data.sms_appointment_opt_in
            ? "pending"
            : "skipped",
      },
      {
        key: "team",
        label: websiteLeadActions.team,
        status: automation.sendTeamNotification ? "pending" : "skipped",
      },
    ];
    const workflowEvent = createWorkflowEvent({
      organizationId,
      type: "website.form.submitted",
      objectType: "lead",
      objectId: lead.id,
      actor: { type: "contact", name: lead.name },
      occurredAt: lead.submittedAt || lead.createdAt,
      idempotencyKey: `website-form:${lead.id}`,
      payload: {
        firstName,
        lastName,
        name,
        email,
        phone,
        zip: data.zip || "",
        address: data.address || "",
        project: lead.project,
        description: lead.projectDescription,
        smsAppointmentOptIn: lead.smsAppointmentOptIn === true,
        smsMarketingOptIn: lead.smsMarketingOptIn === true,
        websiteSubmission: lead.websiteSubmission,
        smsConsentEvidence: lead.smsConsentEvidence,
        leadAttribution: lead.leadAttribution || null,
        otherSubmittedFields: lead.otherSubmittedFields || {},
      },
    });
    const captureRequest =
      workflowMode === "execute"
        ? admin.rpc("remodel_capture_workflow_website_lead", {
            p_organization_id: organizationId,
            p_contact: contact,
            p_lead: lead,
            p_match_existing: automation.matchExistingContacts,
            p_event: workflowEvent,
          })
        : admin.rpc("remodel_capture_website_lead", {
            p_organization_id: organizationId,
            p_contact: contact,
            p_lead: lead,
            p_match_existing: automation.matchExistingContacts,
            p_steps: runSteps,
          });
    const { data: capture, error: captureError } =
      await captureRequest.single();
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
    const captured =
      workflowMode === "execute"
        ? {
            contactId: String((capture as Record<string, unknown>).contactId),
            contactReused:
              (capture as Record<string, unknown>).contactReused === true,
            eventId: String((capture as Record<string, unknown>).eventId),
            runId: null,
          }
        : {
            contactId: String((capture as Record<string, unknown>).contact_id),
            contactReused:
              (capture as Record<string, unknown>).contact_reused === true,
            eventId: null,
            runId: String((capture as Record<string, unknown>).run_id),
          };
    lead.contactId = captured.contactId;
    runSteps[0].status = captured.contactReused ? "reused" : "created";

    if (workflowMode === "execute") {
      try {
        await processWorkflowEvent(captured.eventId!, { mode: "execute" });
      } catch (error) {
        // Contact and Lead capture is already committed atomically with the
        // outbox event. The worker will retry without failing the public form.
        console.error(
          "Could not execute the website lead workflow immediately.",
          error,
        );
      }
      return cors(Response.json({ received: true }, { status: 201 }), origin);
    }
    const runId = captured.runId!;

    const [notificationResult, acknowledgementResult, smsResult] =
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
        automation.sendSmsAcknowledgement
          ? sendWebsiteLeadSmsAcknowledgement({
              organizationId,
              lead,
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
    const smsAcknowledgement =
      smsResult.status === "fulfilled"
        ? smsResult.value
        : {
            status: "unknown" as const,
            attemptedAt: new Date().toISOString(),
            detail: "Text delivery could not be confirmed",
          };
    const replaceStep = (
      key: AutomationRunStep["key"],
      result: { status: AutomationRunStep["status"]; detail?: string },
    ) => {
      const index = runSteps.findIndex((step) => step.key === key);
      if (index >= 0)
        runSteps[index] = {
          ...runSteps[index],
          status: result.status,
          ...(result.detail ? { detail: result.detail } : {}),
        };
    };
    replaceStep("email", emailAcknowledgement);
    replaceStep("sms", smsAcknowledgement);
    replaceStep("team", notification);
    const updatedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("remodel_records")
      .update({
        data: {
          ...lead,
          discordNotification: notification,
          emailAcknowledgement,
          smsAcknowledgement,
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
    try {
      await recordWebsiteLeadDeliveries({
        organizationId,
        lead,
        email: emailAcknowledgement,
        sms: smsAcknowledgement,
      });
    } catch {
      console.error("Could not record the website lead communication history.");
    }
    await finishWebsiteLeadRun({ organizationId, runId, steps: runSteps });

    try {
      await recordWorkflowShadowEvent({
        organizationId,
        type: "website.form.submitted",
        objectType: "lead",
        objectId: lead.id,
        contactId: lead.contactId,
        actor: { type: "contact", id: lead.contactId, name: lead.name },
        occurredAt: lead.submittedAt || lead.createdAt,
        idempotencyKey: `website-form:${lead.id}`,
        payload: {
          firstName,
          lastName,
          name,
          email,
          phone,
          zip: data.zip || "",
          address: data.address || "",
          project: lead.project,
          description: lead.projectDescription,
          smsAppointmentOptIn: lead.smsAppointmentOptIn === true,
          smsMarketingOptIn: lead.smsMarketingOptIn === true,
          websiteSubmission: lead.websiteSubmission,
          smsConsentEvidence: lead.smsConsentEvidence,
          leadAttribution: lead.leadAttribution || null,
          otherSubmittedFields: lead.otherSubmittedFields || {},
          legacyRunId: runId,
          contactReused: captured.contactReused,
        },
      });
    } catch (error) {
      // Shadow automation must never turn a successfully captured lead into a
      // failed form submission. The durable outbox is retried after rollout.
      console.error(
        "Could not record the website lead workflow shadow run.",
        error,
      );
    }

    response = Response.json({ received: true }, { status: 201 });
  } catch (error) {
    response = apiError(error);
  }
  return cors(response, origin);
}
