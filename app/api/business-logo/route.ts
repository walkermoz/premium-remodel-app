import sharp from "sharp";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { getBusinessLogoBytes } from "@/lib/business-logo";
import { getBusinessConfig, saveBusinessConfig } from "@/lib/business-config";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const bytes = await getBusinessLogoBytes(user.organizationId);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can change the logo.");
    const form = await request.formData();
    const file = form.get("logo");
    if (
      !(file instanceof File) ||
      file.size > 4 * 1024 * 1024 ||
      file.size === 0 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw new HttpError(400, "Choose a PNG, JPG, or WebP logo under 4 MB.");
    const image = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
    })
      .resize({
        width: 1200,
        height: 500,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const { error } = await supabaseAdmin()
      .storage.from("remodel-files")
      .upload(`${user.organizationId}/branding/logo.png`, image, {
        contentType: "image/png",
        upsert: true,
      });
    if (error) throw error;
    const current = await getBusinessConfig(user);
    await saveBusinessConfig(user, {
      ...current,
      profile: { ...current.profile, logoUrl: "/api/business-logo" },
    });
    return Response.json({ logoUrl: "/api/business-logo" });
  } catch (error) {
    return apiError(error);
  }
}
