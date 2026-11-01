import "server-only";

import { getBusinessConfigForOrganization } from "../business-config";
import { supabaseAdmin } from "../supabase/server";
import { sendWorkflowEmail } from "./workflow-email";

type IncidentInput = {
  organizationId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  nodeName: string;
  errorCode: string;
  errorDetail: string;
};

function runUrl(workflowId: string, runId: string) {
  const origin = (process.env.APP_URL || "https://servicebuddy-ui.vercel.app")
    .trim()
    .replace(/\/$/, "");
  const url = new URL(origin);
  url.searchParams.set("view", "Automation");
  url.searchParams.set("workflow", workflowId);
  url.searchParams.set("run", runId);
  return url.toString();
}

async function administratorRecipients(organizationId: string) {
  const admin = supabaseAdmin();
  const memberships = await admin
    .from("remodel_memberships")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("role", ["owner", "admin"]);
  if (memberships.error) throw memberships.error;
  const profileIds = memberships.data.map((item) => item.profile_id);
  if (!profileIds.length) return [];
  const profiles = await admin
    .from("profiles")
    .select("id,full_name,email")
    .in("id", profileIds)
    .eq("active", true);
  if (profiles.error) throw profiles.error;
  return profiles.data.filter(
    (profile) =>
      typeof profile.email === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email),
  );
}

async function sendPlatformIncidentEmail(input: {
  organizationId: string;
  recipients: string[];
  subject: string;
  body: string;
  incidentId: string;
}) {
  if (!input.recipients.length)
    return {
      status: "unavailable" as const,
      detail: "No active owner or administrator has an email address.",
    };

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const platformFrom = process.env.SERVICEBUDDY_NOTIFICATION_FROM_EMAIL?.trim();
  if (resendKey && platformFrom) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: platformFrom,
        to: input.recipients,
        subject: input.subject,
        text: input.body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      return {
        status: "failed" as const,
        detail: `ServiceBuddy notification email returned HTTP ${response.status}.`,
      };
    return { status: "sent" as const, detail: "Sent by ServiceBuddy." };
  }

  const failures: string[] = [];
  for (const recipient of input.recipients) {
    try {
      await sendWorkflowEmail({
        organizationId: input.organizationId,
        recipient,
        subject: input.subject,
        body: input.body,
        idempotencyKey: `workflow-incident:${input.incidentId}:${recipient}`,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Email failed.");
    }
  }
  if (failures.length === input.recipients.length)
    return {
      status: "failed" as const,
      detail: failures[0]?.slice(0, 500) || "Admin email could not be sent.",
    };
  return {
    status: "sent" as const,
    detail:
      failures.length > 0
        ? `Sent to ${input.recipients.length - failures.length} of ${input.recipients.length} administrators.`
        : "Sent from the connected company mailbox.",
  };
}

export async function openWorkflowIncident(input: IncidentInput) {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const prior = await admin
    .from("remodel_workflow_incidents")
    .select("id,status,email_status,email_attempted_at")
    .eq("organization_id", input.organizationId)
    .eq("run_id", input.runId)
    .eq("node_id", input.nodeId)
    .maybeSingle();
  if (prior.error) throw prior.error;
  const reopened = prior.data?.status === "resolved";
  const incident = await admin
    .from("remodel_workflow_incidents")
    .upsert(
      {
        organization_id: input.organizationId,
        workflow_id: input.workflowId,
        run_id: input.runId,
        node_id: input.nodeId,
        node_name: input.nodeName,
        error_code: input.errorCode,
        error_detail: input.errorDetail.slice(0, 2_000),
        status: "open",
        last_seen_at: now,
        resolved_at: null,
        ...(reopened
          ? {
              in_app_notified_at: null,
              email_status: "pending",
              email_detail: null,
              email_attempted_at: null,
            }
          : {}),
      },
      { onConflict: "organization_id,run_id,node_id" },
    )
    .select("id,status,in_app_notified_at,email_status,email_attempted_at")
    .single();
  if (incident.error) throw incident.error;

  const workflow = await admin
    .from("remodel_workflows")
    .select("name")
    .eq("organization_id", input.organizationId)
    .eq("id", input.workflowId)
    .maybeSingle();
  if (workflow.error) throw workflow.error;
  const workflowName = workflow.data?.name || "Workflow";
  const link = runUrl(input.workflowId, input.runId);
  const recipients = await administratorRecipients(input.organizationId);

  if (!incident.data.in_app_notified_at || reopened) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    const message = `${workflowName} is blocked at “${input.nodeName}”: ${input.errorDetail} Open Automation → Runs to resolve it.`.slice(
      0,
      500,
    );
    const alert = {
      id: incident.data.id,
      message,
      audiences: ["administrators"],
      durationMinutes: 43_200,
      expiresAt,
      authorId: recipients[0]?.id || incident.data.id,
      authorName: "ServiceBuddy",
      incidentId: incident.data.id,
      workflowId: input.workflowId,
      runId: input.runId,
      link,
      linkLabel: "Review blocked run",
      systemKind: "workflow_incident",
      createdAt: now,
      updatedAt: now,
    };
    const alertResult = await admin.from("remodel_records").upsert(
      {
        id: incident.data.id,
        organization_id: input.organizationId,
        created_by: recipients[0]?.id || null,
        updated_by: recipients[0]?.id || null,
        kind: "alert",
        project_id: null,
        data: alert,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (alertResult.error) throw alertResult.error;
    const marked = await admin
      .from("remodel_workflow_incidents")
      .update({ in_app_notified_at: now })
      .eq("organization_id", input.organizationId)
      .eq("id", incident.data.id);
    if (marked.error) throw marked.error;
  }

  const lastAttempt = incident.data.email_attempted_at
    ? Date.parse(incident.data.email_attempted_at)
    : 0;
  const shouldEmail =
    incident.data.email_status !== "sent" &&
    (!lastAttempt || Date.now() - lastAttempt >= 60 * 60_000);
  if (shouldEmail) {
    const business = await getBusinessConfigForOrganization(
      input.organizationId,
    );
    const subject = `[Action required] ${workflowName} is blocked`;
    const body = [
      `${business.profile.name}'s automation “${workflowName}” needs attention.`,
      "",
      `Blocked step: ${input.nodeName}`,
      `Reason: ${input.errorDetail}`,
      "",
      `Open the run: ${link}`,
      "",
      "The run will remain blocked and will not silently skip this action.",
    ].join("\n");
    let result:
      | { status: "sent" | "failed" | "unavailable"; detail: string }
      | undefined;
    try {
      result = await sendPlatformIncidentEmail({
        organizationId: input.organizationId,
        recipients: recipients.map((recipient) => recipient.email),
        subject,
        body,
        incidentId: incident.data.id,
      });
    } catch (error) {
      result = {
        status: "failed",
        detail:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Admin email could not be sent.",
      };
    }
    const emailUpdate = await admin
      .from("remodel_workflow_incidents")
      .update({
        email_status: result.status,
        email_detail: result.detail,
        email_attempted_at: now,
        email_recipients: recipients.map((recipient) => recipient.email),
      })
      .eq("organization_id", input.organizationId)
      .eq("id", incident.data.id);
    if (emailUpdate.error) throw emailUpdate.error;
  }

  return incident.data.id;
}

export async function resolveWorkflowIncidents(input: {
  organizationId: string;
  runId: string;
}) {
  const admin = supabaseAdmin();
  const open = await admin
    .from("remodel_workflow_incidents")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("run_id", input.runId)
    .eq("status", "open");
  if (open.error) throw open.error;
  if (!open.data.length) return;
  const ids = open.data.map((incident) => incident.id);
  const now = new Date().toISOString();
  const resolved = await admin
    .from("remodel_workflow_incidents")
    .update({ status: "resolved", resolved_at: now })
    .eq("organization_id", input.organizationId)
    .in("id", ids)
    .eq("status", "open");
  if (resolved.error) throw resolved.error;

  const alerts = await admin
    .from("remodel_records")
    .select("id,data")
    .eq("organization_id", input.organizationId)
    .eq("kind", "alert")
    .in("id", ids);
  if (alerts.error) throw alerts.error;
  for (const alert of alerts.data) {
    const hidden = await admin
      .from("remodel_records")
      .update({
        data: { ...alert.data, expiresAt: now, updatedAt: now },
        updated_at: now,
      })
      .eq("organization_id", input.organizationId)
      .eq("id", alert.id);
    if (hidden.error) throw hidden.error;
  }
}
