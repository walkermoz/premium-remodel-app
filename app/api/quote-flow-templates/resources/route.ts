import { apiError, requireUser } from "@/lib/auth";
import { listAgreementTemplates } from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "quote_flows.manage");
    const agreements = await listAgreementTemplates(user.organizationId);
    return Response.json(
      {
        agreements: agreements
          .filter((template) => template.status === "published")
          .map((template) => ({
            id: template.id,
            templateKey: template.templateKey,
            name: template.name,
            sourceType: template.sourceType,
            publishedVersion: template.publishedVersion,
          })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
