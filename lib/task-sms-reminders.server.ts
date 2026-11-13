import "server-only";
import type { Contact, Project, Task } from "./types";
import { normalizeSmsRecipient } from "./install-link";
import { sendCustomerSms } from "./sms-compliance";
import { supabaseAdmin } from "./supabase/server";
import { homeownerScheduleSmsMessage } from "./task-sms-message";
import { getBusinessConfigForOrganization } from "./business-config";

interface ClaimedReminder {
  organization_id: string;
  project_id: string;
  reminder_date: string;
  attempts: number;
}

async function updateReminder(
  claim: ClaimedReminder,
  values: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin()
    .from("remodel_project_sms_reminders")
    .update(values)
    .eq("organization_id", claim.organization_id)
    .eq("project_id", claim.project_id)
    .eq("reminder_date", claim.reminder_date)
    .eq("status", "claimed")
    .eq("attempts", claim.attempts);
  if (error) throw error;
}

async function processReminder(claim: ClaimedReminder) {
  const admin = supabaseAdmin();
  try {
    const projectResult = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", claim.organization_id)
      .eq("id", claim.project_id)
      .eq("kind", "project")
      .maybeSingle();
    if (projectResult.error) throw projectResult.error;
    const project = projectResult.data?.data as Project | undefined;
    if (
      !project ||
      !project.smsScheduleEnabled ||
      project.status === "Completed"
    ) {
      await updateReminder(claim, { status: "skipped" });
      return { projectId: claim.project_id, status: "skipped" };
    }
    const business = await getBusinessConfigForOrganization(
      claim.organization_id,
    );
    const localTime = new Date().toLocaleTimeString("en-GB", {
      timeZone: business.regional.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const taskResult = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", claim.organization_id)
      .eq("project_id", claim.project_id)
      .eq("kind", "task")
      .eq("data->>dueDate", claim.reminder_date);
    if (taskResult.error) throw taskResult.error;
    const tasks = (taskResult.data || [])
      .map((row) => row.data as Task)
      .filter(
        (task) =>
          task.status !== "Done" &&
          (!task.startTime || task.startTime > localTime),
      )
      .sort(
        (a, b) =>
          (a.startTime || "99:99").localeCompare(b.startTime || "99:99") ||
          a.createdAt.localeCompare(b.createdAt),
      );
    if (!tasks.length) {
      await updateReminder(claim, { status: "skipped" });
      return { projectId: claim.project_id, status: "skipped" };
    }
    const recipientId = project.contactId;
    if (!recipientId) {
      await updateReminder(claim, { status: "skipped" });
      return { projectId: claim.project_id, status: "skipped" };
    }
    const recipientResult = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", claim.organization_id)
      .eq("id", recipientId)
      .eq("kind", "contact")
      .maybeSingle();
    if (recipientResult.error) throw recipientResult.error;
    const recipient = recipientResult.data?.data as Contact | undefined;
    const phone = normalizeSmsRecipient(recipient?.phone || "");
    if (!recipient || !phone)
      throw new Error("Reminder recipient has no valid mobile number.");
    const sent = await sendCustomerSms(claim.organization_id, {
      contactId: recipientId,
      to: phone,
      body: homeownerScheduleSmsMessage(
        tasks,
        project,
        recipient,
        business.profile.name,
      ),
      category: "appointment",
    });
    await updateReminder(claim, {
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_e164: phone,
      message_sid: sent.sid,
      last_error: null,
    });
    return { projectId: claim.project_id, status: "sent" };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 250)
        : "Unknown reminder error";
    await updateReminder(claim, { status: "failed", last_error: message });
    return { projectId: claim.project_id, status: "failed" };
  }
}

export async function processDueProjectSmsReminders() {
  const { data, error } = await supabaseAdmin().rpc(
    "remodel_claim_due_project_sms_reminders",
    { batch_size: 10 },
  );
  if (error) throw error;
  const claimed = (data || []) as ClaimedReminder[];
  const results = await Promise.all(claimed.map(processReminder));
  return {
    processed: results.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  };
}
