import "server-only";
import { HttpError, type WorkspaceUser } from "./auth";
import { leadDisposition } from "./leads";
import type { Lead } from "./types";
import { supabaseAdmin } from "./supabase/server";

export async function findLeadRecord(
  organizationId: string,
  leadId: string,
): Promise<Lead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return null;
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "lead")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ? (data.data as Lead) : null;
}

export async function listLeadRecords(
  organizationId: string,
  {
    status,
    disposition,
    limit = 50,
  }: {
    status?: string;
    disposition?: string;
    limit?: number;
  } = {},
): Promise<Lead[]> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "lead")
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  let leads = (data || []).map((row) => row.data as Lead);
  if (status) leads = leads.filter((lead) => lead.status === status);
  if (disposition)
    leads = leads.filter((lead) => leadDisposition(lead) === disposition);
  return leads;
}

export async function updateLeadRecord(
  actor: WorkspaceUser,
  current: Lead,
  patch: Partial<Lead>,
) {
  const now = new Date(
    Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
  ).toISOString();
  const entity: Lead = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .update({
      data: entity,
      updated_at: now,
      updated_by: actor.id,
    })
    .eq("organization_id", actor.organizationId)
    .eq("kind", "lead")
    .eq("id", current.id)
    .eq("updated_at", current.updatedAt)
    .select("id");
  if (error) throw error;
  if (!data?.length)
    throw new HttpError(
      409,
      "Someone updated this lead. Refresh and try again.",
    );
  return entity;
}

/** Best-effort lead stage update when quote status changes (no 409 to caller). */
export async function syncLeadStageFromQuote(
  actor: WorkspaceUser,
  leadId: string | undefined,
  patch: Partial<Lead> | null,
) {
  if (!leadId || !patch) return null;
  const current = await findLeadRecord(actor.organizationId, leadId);
  if (!current) return null;
  try {
    return await updateLeadRecord(actor, current, patch);
  } catch (error) {
    console.error(
      "Could not sync lead stage from quote",
      error instanceof Error ? error.name : "LeadSyncError",
    );
    return null;
  }
}

/** A client-link signature has no workspace member, so attribute this update to the link. */
export async function syncLeadStageFromClientAcceptance(
  organizationId: string,
  leadId: string | undefined,
) {
  if (!leadId) return;
  try {
    const current = await findLeadRecord(organizationId, leadId);
    if (!current || current.status === "Won") return;
    const now = new Date(
      Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
    ).toISOString();
    const { error } = await supabaseAdmin()
      .from("remodel_records")
      .update({
        data: { ...current, status: "Won", updatedAt: now },
        updated_at: now,
        updated_by: null,
      })
      .eq("organization_id", organizationId)
      .eq("kind", "lead")
      .eq("id", leadId)
      .eq("updated_at", current.updatedAt);
    if (error) throw error;
  } catch (error) {
    console.error(
      "Could not sync lead stage from client acceptance",
      error instanceof Error ? error.name : "LeadSyncError",
    );
  }
}
