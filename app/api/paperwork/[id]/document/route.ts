import { apiError, requireUser } from "@/lib/auth";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { paperworkDocument } from "@/lib/paperwork";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const document = await paperworkDocument(
      user.organizationId,
      (await params).id,
    );
    const filename = document.filename.replace(/[^a-zA-Z0-9 ._-]/g, "_");
    return new Response(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
