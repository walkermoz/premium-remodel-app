import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { createUploadedAgreementTemplate } from "@/lib/agreement-templates";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    if (Number(request.headers.get("content-length") || 0) > 21 * 1024 * 1024)
      throw new HttpError(413, "Choose a PDF no larger than 20 MB.");
    await limitAttempts(`agreement-upload:${user.id}`, 30);
    const form = await request.formData();
    const file = form.get("file");
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!(file instanceof File))
      throw new HttpError(400, "Choose an agreement PDF.");
    if (!name || name.length > 200 || description.length > 2_000)
      throw new HttpError(400, "Enter a valid template name and description.");
    const template = await createUploadedAgreementTemplate(user, {
      name,
      description,
      file,
    });
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "agreement_template",
      entityId: template.id,
      subject: `Uploaded agreement template ${template.name}`,
      afterData: {
        sourceType: template.sourceType,
        pageCount: template.pageCount,
        fileSha256: template.fileSha256,
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
