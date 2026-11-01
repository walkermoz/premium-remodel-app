import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth";
import { agreementTemplateSource } from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const { id } = await context.params;
    const source = await agreementTemplateSource(
      user.organizationId,
      z.uuid().parse(id),
    );
    return new Response(source.bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(source.filename)}`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        ...(source.sha256 ? { ETag: `\"sha256-${source.sha256}\"` } : {}),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
