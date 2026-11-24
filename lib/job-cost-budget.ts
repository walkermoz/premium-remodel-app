import "server-only";

import type { Project, ScopeItem } from "./types";
import { supabaseAdmin } from "./supabase/server";

export async function captureJobCostBudgetSnapshot(
  organizationId: string,
  projectId: string,
  capturedAt: string,
): Promise<NonNullable<Project["jobCostBudgetSnapshot"]>> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "scope")
    .eq("project_id", projectId)
    .order("updated_at")
    .limit(1001);
  if (error) throw error;
  if (data.length > 1000)
    throw new Error("Too many scope items to capture a job-cost budget.");
  return {
    capturedAt,
    source: "accepted_quote",
    items: data.map((row) => {
      const item = row.data as ScopeItem;
      return {
        scopeItemId: item.id,
        title: item.title,
        estimate: item.estimate,
        subCost: item.subCost,
        materialCost: item.materialCost || 0,
      };
    }),
  };
}
