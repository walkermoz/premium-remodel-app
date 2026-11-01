import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { agreementTemplateDefinitionSchema } from "@/lib/agreement-template-schema";
import {
  getAgreementTemplate,
  setAgreementTemplateArchived,
  updateAgreementTemplate,
} from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const updateInput = z.object({
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).default(""),
  definition: agreementTemplateDefinitionSchema,
});

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const { id } = await context.params;
    return Response.json(
      await getAgreementTemplate(user.organizationId, z.uuid().parse(id)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const raw = await request.text();
    if (raw.length > 1_000_000)
      throw new HttpError(413, "Agreement template data is too large.");
    const { id } = await context.params;
    const input = updateInput.parse(JSON.parse(raw));
    const template = await updateAgreementTemplate(
      user,
      z.uuid().parse(id),
      input,
    );
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "agreement_template",
      entityId: template.id,
      subject: `Updated agreement template ${template.name}`,
      afterData: {
        revision: template.revision,
        fieldCount: template.fields.length,
        signerCount: template.signerRoles.length,
      },
    });
    return Response.json(template, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const { id } = await context.params;
    const template = await setAgreementTemplateArchived(
      user,
      z.uuid().parse(id),
      true,
    );
    await recordAuditEvent(user, {
      action: "deleted",
      entityKind: "agreement_template",
      entityId: template.id,
      subject: `Archived agreement template ${template.name}`,
    });
    return Response.json(template, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
