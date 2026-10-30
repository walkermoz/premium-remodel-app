import "server-only";

import type { WorkspaceUser } from "./auth";
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
    .select("definition")
    .eq("organization_id", organizationId)
    .eq("automation_key", automationKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultWebsiteLeadAutomation();
  return websiteLeadAutomationSchema.parse(data.definition);
}

export async function saveWebsiteLeadAutomation(
  user: WorkspaceUser,
  input: WebsiteLeadAutomation,
): Promise<WebsiteLeadAutomation> {
  const definition = websiteLeadAutomationSchema.parse(input);
  const { error } = await supabaseAdmin().from("remodel_automations").upsert({
    organization_id: user.organizationId,
    automation_key: automationKey,
    definition,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return definition;
}
