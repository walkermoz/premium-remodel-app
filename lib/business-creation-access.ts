import type { WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";

export async function hasPlatformCapability(
  user: Pick<WorkspaceUser, "id">,
  capability: "platform_owner",
) {
  const result = await supabaseAdmin()
    .from("servicebuddy_platform_capabilities")
    .select("profile_id")
    .eq("profile_id", user.id)
    .eq("capability", capability)
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

export async function canCreateBusiness(
  user: Pick<WorkspaceUser, "id">,
): Promise<boolean> {
  return hasPlatformCapability(user, "platform_owner");
}
