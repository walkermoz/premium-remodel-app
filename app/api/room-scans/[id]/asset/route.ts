import { apiError, HttpError, requireUser } from "@/lib/auth";
import { findRoomScan } from "@/lib/room-scans";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const paths = {
  preview: "preview_path",
  model: "model_path",
  metadata: "metadata_path",
} as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const { id } = await context.params;
    const scan = await findRoomScan(user.organizationId, id);
    if (!scan) throw new HttpError(404, "Room scan not found.");
    const kind = new URL(request.url).searchParams.get("kind") || "preview";
    if (!(kind in paths)) throw new HttpError(400, "Unknown room-scan asset.");
    const path = String(scan[paths[kind as keyof typeof paths]]);
    if (!path.startsWith(`${user.organizationId}/${scan.quote_id}/room-scans/`))
      throw new HttpError(404, "Room-scan asset not found.");
    const signed = await supabaseAdmin()
      .storage.from("remodel-files")
      .createSignedUrl(path, 60, {
        download:
          kind === "metadata"
            ? `${scan.room_name}.json`
            : kind === "model"
              ? `${scan.room_name}.usdz`
              : false,
      });
    if (signed.error) throw signed.error;
    return Response.redirect(signed.data.signedUrl, 302);
  } catch (error) {
    return apiError(error);
  }
}
