import "server-only";

import type { WorkspaceUser } from "./auth";
import { HttpError } from "./auth";
import {
  defaultWebsiteLeadAutomation,
  websiteLeadAutomationSchema,
  type WebsiteLeadAutomation,
} from "./automation-config";
import { supabaseAdmin } from "./supabase/server";

const automationKey = "website-lead-intake";

export async function getWebsiteLeadAutomation(
  organizationId: string,
): Promise<WebsiteLeadAutomation> {
  const { data, error } = await supabaseAdmin()
    .from("remodel_automations")
    .select("definition,revision")
    .eq("organization_id", organizationId)
    .eq("automation_key", automationKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultWebsiteLeadAutomation();
  return {
    ...websiteLeadAutomationSchema.parse(data.definition),
    revision: Number(data.revision),
  };
}

export async function saveWebsiteLeadAutomation(
  user: WorkspaceUser,
  input: WebsiteLeadAutomation,
): Promise<WebsiteLeadAutomation> {
  const { revision, ...definition } = websiteLeadAutomationSchema.parse(input);
  const { data, error } = await supabaseAdmin().rpc(
    "remodel_save_website_lead_automation",
    {
      p_organization_id: user.organizationId,
      p_actor_id: user.id,
      p_expected_revision: revision,
      p_definition: definition,
    },
  );
  if (error) throw error;
  if (data.result === "conflict")
    throw new HttpError(
      409,
      "This workflow changed in another session. Refresh to load the current settings before saving.",
    );
  return { ...definition, revision: Number(data.revision) };
}

export async function listWebsiteLeadAutomationRevisions(
  organizationId: string,
) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_automation_revisions")
    .select("revision,definition,actor_name,changed_at")
    .eq("organization_id", organizationId)
    .eq("automation_key", automationKey)
    .order("revision", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data || []).map((row) => ({
    revision: Number(row.revision),
    definition: websiteLeadAutomationSchema.parse(row.definition),
    actorName: row.actor_name,
    changedAt: row.changed_at,
  }));
}
