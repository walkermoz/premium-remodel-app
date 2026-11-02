import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { publishQuoteFlowTemplate } from "@/lib/quote-flow-templates";

export const runtime = "nodejs";

const inputSchema = z.object({
  revision: z.number().int().min(0),
  changeNote: z.string().trim().max(500).default(""),
  makeDefault: z.boolean().default(true),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "quote_flows.publish");
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const template = await publishQuoteFlowTemplate(
      user,
      z.uuid().parse(id),
      input,
    );
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "quote_flow_template",
      entityId: template.id,
      subject: `Published ${template.name} version ${template.publishedVersion}`,
      afterData: {
        publishedVersion: template.publishedVersion,
        makeDefault: input.makeDefault,
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
