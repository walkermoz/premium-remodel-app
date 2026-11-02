import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { quoteFlowDefinitionSchema } from "@/lib/quote-flow-schema";
import {
  createQuoteFlowTemplate,
  listQuoteFlowTemplates,
} from "@/lib/quote-flow-templates";

export const runtime = "nodejs";

const createInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).default(""),
  definition: quoteFlowDefinitionSchema.optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "quote_flows.manage");
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    return Response.json(
      {
        templates: await listQuoteFlowTemplates(
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
    await requireOrganizationCapability(user, "quote_flows.manage");
    const raw = await request.text();
    if (raw.length > 2_000_000)
      throw new HttpError(413, "Quote flow template data is too large.");
    const input = createInput.parse(JSON.parse(raw));
    const template = await createQuoteFlowTemplate(user, input);
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "quote_flow_template",
      entityId: template.id,
      subject: `Created quote flow ${template.name}`,
      afterData: { stageCount: template.definition.stages.length },
    });
    return Response.json(template, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
