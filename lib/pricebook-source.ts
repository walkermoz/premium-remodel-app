import "server-only";

import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";

type Source = { pricebookItemId?: string; pricebookRevision?: number };

export async function validatePricebookSources(
  user: WorkspaceUser,
  lines: Source[],
) {
  const referenced = lines.filter((line) => line.pricebookItemId);
  if (!referenced.length) return;
  const ids = [...new Set(referenced.map((line) => line.pricebookItemId!))];
  const { data, error } = await supabaseAdmin()
    .from("remodel_pricebook_items")
    .select("id,revision")
    .eq("organization_id", user.organizationId)
    .eq("active", true)
    .in("id", ids);
  if (error) throw error;
  const revisions = new Map(data.map((item) => [item.id, item.revision]));
  if (
    referenced.some(
      (line) => revisions.get(line.pricebookItemId!) !== line.pricebookRevision,
    )
  )
    throw new HttpError(
      400,
      "This price-book item changed or is unavailable. Add the current item again.",
    );
}
