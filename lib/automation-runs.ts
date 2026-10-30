import "server-only";

import { supabaseAdmin } from "./supabase/server";

export type AutomationRunStep = {
  key: "contact" | "lead" | "email" | "team" | "record";
  label: string;
  status:
    | "created"
    | "reused"
    | "sent"
    | "skipped"
    | "failed"
    | "unknown"
    | "not_configured";
  detail?: string;
};

export type AutomationRun = {
  id: string;
  leadId: string | null;
  subject: string;
  project: string;
  status: "running" | "completed" | "needs_attention";
  steps: AutomationRunStep[];
  startedAt: string;
  completedAt: string | null;
};

const automationKey = "website-lead-intake";

export async function startWebsiteLeadRun(input: {
  organizationId: string;
  leadId: string;
  subject: string;
  project: string;
  steps: AutomationRunStep[];
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_automation_runs")
    .insert({
      organization_id: input.organizationId,
      automation_key: automationKey,
      lead_id: input.leadId,
      subject: input.subject.slice(0, 250),
      project: input.project.slice(0, 250),
      status: "running",
      steps: input.steps,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Could not start the website lead automation run.");
    return null;
  }
  return data.id;
}

export async function finishWebsiteLeadRun(input: {
  organizationId: string;
  runId: string | null;
  steps: AutomationRunStep[];
}) {
  if (!input.runId) return;
  const needsAttention = input.steps.some((step) =>
    ["failed", "unknown", "not_configured"].includes(step.status),
  );
  const { error } = await supabaseAdmin()
    .from("remodel_automation_runs")
    .update({
      status: needsAttention ? "needs_attention" : "completed",
      steps: input.steps,
      completed_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.runId);
  if (error) console.error("Could not finish the website lead automation run.");
}

export async function listWebsiteLeadRuns(organizationId: string, offset = 0) {
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [page, recent, attention] = await Promise.all([
    admin
      .from("remodel_automation_runs")
      .select(
        "id,lead_id,subject,project,status,steps,started_at,completed_at",
        {
          count: "exact",
        },
      )
      .eq("organization_id", organizationId)
      .eq("automation_key", automationKey)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 24),
    admin
      .from("remodel_automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("automation_key", automationKey)
      .gte("started_at", since),
    admin
      .from("remodel_automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("automation_key", automationKey)
      .eq("status", "needs_attention")
      .gte("started_at", since),
  ]);
  if (page.error || recent.error || attention.error)
    throw page.error || recent.error || attention.error;
  const runs: AutomationRun[] = (page.data || []).map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    subject: row.subject,
    project: row.project,
    status: row.status,
    steps: row.steps,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));
  return {
    runs,
    total: page.count || 0,
    recentCount: recent.count || 0,
    attentionCount: attention.count || 0,
  };
}
