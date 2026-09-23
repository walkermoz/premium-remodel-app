import { parseClientPortalToken } from "@/lib/client-portal";
import { FILE_VALIDATION_VERSION } from "@/lib/file-policy";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const linkId = parseClientPortalToken(token);
    if (!linkId) return new Response("Not found", { status: 404 });

    const admin = supabaseAdmin();
    const { data: link, error: linkError } = await admin
      .from("remodel_client_links")
      .select("organization_id,project_id")
      .eq("id", linkId)
      .is("revoked_at", null)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return new Response("Not found", { status: 404 });

    const { data: projectRow, error: projectError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", link.organization_id)
      .eq("id", link.project_id)
      .eq("kind", "project")
      .maybeSingle();
    if (projectError) throw projectError;
    const coverId = String(projectRow?.data?.coverAttachmentId || "");
    if (!/^[0-9a-f-]{36}$/i.test(coverId))
      return new Response("Not found", { status: 404 });

    const { data: attachmentRow, error: attachmentError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", link.organization_id)
      .eq("project_id", link.project_id)
      .eq("id", coverId)
      .eq("kind", "attachment")
      .maybeSingle();
    if (attachmentError) throw attachmentError;
    const attachment = attachmentRow?.data;
    if (
      !attachment ||
      !imageTypes.has(attachment.mime) ||
      attachment.validationVersion !== FILE_VALIDATION_VERSION ||
      typeof attachment.path !== "string" ||
      !attachment.path.startsWith(`${link.organization_id}/${link.project_id}/`)
    )
      return new Response("Not found", { status: 404 });

    const { data, error } = await admin.storage
      .from("remodel-files")
      .download(attachment.path);
    if (error || !data) return new Response("Not found", { status: 404 });
    return new Response(data, {
      headers: {
        "Content-Type": attachment.mime,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
