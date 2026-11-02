import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { duplicateQuoteFlowTemplate } from "@/lib/quote-flow-templates";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "quote_flows.manage");
    const { id } = await context.params;
    const input = z
      .object({ name: z.string().trim().min(1).max(200).optional() })
      .parse(await request.json().catch(() => ({})));
    const template = await duplicateQuoteFlowTemplate(
      user,
      z.uuid().parse(id),
      input.name,
    );
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "quote_flow_template",
      entityId: template.id,
      subject: `Duplicated quote flow as ${template.name}`,
    });
    return Response.json(template, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
