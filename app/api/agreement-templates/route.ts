import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { agreementTemplateDefinitionSchema } from "@/lib/agreement-template-schema";
import {
  createAuthoredAgreementTemplate,
  listAgreementTemplates,
} from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

const createInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).default(""),
  definition: agreementTemplateDefinitionSchema.optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    return Response.json(
      {
        templates: await listAgreementTemplates(
          user.organizationId,
          includeArchived,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const raw = await request.text();
    if (raw.length > 1_000_000)
      throw new HttpError(413, "Agreement template data is too large.");
    const input = createInput.parse(JSON.parse(raw));
    const template = await createAuthoredAgreementTemplate(user, input);
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "agreement_template",
      entityId: template.id,
      subject: `Created agreement template ${template.name}`,
      afterData: {
        sourceType: template.sourceType,
        status: template.status,
      },
    });
    return Response.json(template, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
