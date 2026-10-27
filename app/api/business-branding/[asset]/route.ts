import sharp from "sharp";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import {
  brandingAssetPath,
  brandingAssets,
  getBusinessBrandingBytes,
  isBrandingAsset,
} from "@/lib/business-branding";
import { getBusinessConfig, saveBusinessConfig } from "@/lib/business-config";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ asset: string }> };

async function assetFrom(context: Context) {
  const { asset } = await context.params;
  if (!isBrandingAsset(asset))
    throw new HttpError(404, "Brand asset not found.");
  return asset;
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const asset = await assetFrom(context);
    const config = await getBusinessConfig(user);
    if (!config.profile[brandingAssets[asset].field])
      return new Response(null, { status: 404 });
    const bytes = await getBusinessBrandingBytes(user.organizationId, asset);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can change branding.");
    const asset = await assetFrom(context);
    const file = (await request.formData()).get("image");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 4 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw new HttpError(400, "Choose a PNG, JPG, or WebP image under 4 MB.");
    const size = brandingAssets[asset];
    const image = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
    })
      .resize({
        width: size.width,
        height: size.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const { error } = await supabaseAdmin()
      .storage.from("remodel-files")
      .upload(brandingAssetPath(user.organizationId, asset), image, {
        contentType: "image/png",
        upsert: true,
      });
    if (error) throw error;
    const url = `/api/business-branding/${asset}`;
    const current = await getBusinessConfig(user);
    await saveBusinessConfig(user, {
      ...current,
      profile: { ...current.profile, [size.field]: url },
    });
    return Response.json({ url });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can change branding.");
    const asset = await assetFrom(context);
    const current = await getBusinessConfig(user);
    const field = brandingAssets[asset].field;
    await saveBusinessConfig(user, {
      ...current,
      profile: { ...current.profile, [field]: "" },
    });
    const { error } = await supabaseAdmin()
      .storage.from("remodel-files")
      .remove([brandingAssetPath(user.organizationId, asset)]);
    if (error) throw error;
    return Response.json({ url: "" });
  } catch (error) {
    return apiError(error);
  }
}
