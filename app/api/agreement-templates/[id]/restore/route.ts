import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { setAgreementTemplateArchived } from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const { id } = await context.params;
    const template = await setAgreementTemplateArchived(
      user,
      z.uuid().parse(id),
      false,
    );
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "agreement_template",
      entityId: template.id,
      subject: `Restored agreement template ${template.name}`,
    });
    return Response.json(template, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
