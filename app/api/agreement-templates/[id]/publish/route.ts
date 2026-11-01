import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { publishAgreementTemplate } from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

const inputSchema = z.object({
  revision: z.number().int().min(0),
  changeNote: z.string().trim().max(500).default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const template = await publishAgreementTemplate(
      user,
      z.uuid().parse(id),
      input,
    );
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "agreement_template",
      entityId: template.id,
      subject: `Published ${template.name} version ${template.publishedVersion}`,
      afterData: {
        publishedVersion: template.publishedVersion,
        changeNote: input.changeNote,
      },
    });
    return Response.json(template, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
