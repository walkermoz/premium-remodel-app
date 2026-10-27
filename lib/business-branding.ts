import "server-only";
import { supabaseAdmin } from "./supabase/server";

export const brandingAssets = {
  "logo-dark": { field: "logoDarkUrl", width: 1200, height: 500 },
  "logo-mark": { field: "logoMarkUrl", width: 600, height: 600 },
  banner: { field: "bannerUrl", width: 2400, height: 800 },
} as const;

export type BrandingAsset = keyof typeof brandingAssets;

export function isBrandingAsset(value: string): value is BrandingAsset {
  return Object.hasOwn(brandingAssets, value);
}

export function brandingAssetPath(
  organizationId: string,
  asset: BrandingAsset,
) {
  return `${organizationId}/branding/${asset}.png`;
}

export async function getBusinessBrandingBytes(
  organizationId: string,
  asset: BrandingAsset,
): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin()
    .storage.from("remodel-files")
    .download(brandingAssetPath(organizationId, asset));
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
