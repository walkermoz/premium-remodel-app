import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getBusinessConfigForOrganization } from "./business-config";
import { supabaseAdmin } from "./supabase/server";

export async function getBusinessLogoBytes(
  organizationId: string,
): Promise<Uint8Array | null> {
  const config = await getBusinessConfigForOrganization(organizationId);
  if (config.profile.logoUrl === "/api/business-logo") {
    const { data, error } = await supabaseAdmin()
      .storage.from("remodel-files")
      .download(`${organizationId}/branding/logo.png`);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  if (config.profile.logoUrl === "/images/logo.png")
    return readFile(path.join(process.cwd(), "public", "images", "logo.png"));
  return null;
}
