import "server-only";

import { jobCostSummary } from "./job-costing";
import { supabaseAdmin } from "./supabase/server";
import type { ActualCost, Project, ScopeItem } from "./types";
import type { WorkspaceUser } from "./auth";
import { enqueueWorkflowEvent } from "./workflows/events";

export async function emitJobCostVarianceEvent(
  user: WorkspaceUser,
  cost: ActualCost,
) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", user.organizationId)
    .eq("project_id", cost.projectId)
    .in("kind", ["scope", "actual_cost"])
    .limit(2001);
  if (error) throw error;
  if (data.length > 2000) return;
  const projectResult = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", user.organizationId)
    .eq("kind", "project")
    .eq("id", cost.projectId)
    .maybeSingle();
  if (projectResult.error || !projectResult.data) return;
  const project = projectResult.data.data as Project;
  const scope = data
    .filter((row) => row.kind === "scope")
    .map((row) => row.data as ScopeItem);
  const actualCosts = data
    .filter((row) => row.kind === "actual_cost")
    .map((row) => row.data as ActualCost);
  const summary = jobCostSummary(
    project.id,
    scope,
    actualCosts,
    project.jobCostBudgetSnapshot,
  );
  if (summary.variance >= 0) return;
  await enqueueWorkflowEvent({
    organizationId: user.organizationId,
    type: "project.cost.over_budget",
    objectType: "project",
    objectId: project.id,
    actor: { type: "user", id: user.id, name: user.name },
    occurredAt: cost.updatedAt,
    idempotencyKey: `job-cost-over-budget:${cost.id}:${cost.updatedAt}`,
    payload: {
      projectId: project.id,
      projectName: project.name,
      triggeringCostId: cost.id,
      budget: summary.budget,
      actual: summary.actual,
      variance: summary.variance,
      actualMargin: summary.actualMargin,
      actualMarginPercent: summary.actualMarginPercent,
    },
  });
}
