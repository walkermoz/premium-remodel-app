import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { quoteFlowDefinitionSchema } from "@/lib/quote-flow-schema";
import {
  getQuoteFlowTemplate,
  setQuoteFlowTemplateArchived,
  updateQuoteFlowTemplate,
} from "@/lib/quote-flow-templates";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const updateInput = z.object({
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).default(""),
  definition: quoteFlowDefinitionSchema,
});
const archiveInput = z.object({ archived: z.boolean() });

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "quote_flows.manage");
    const { id } = await context.params;
    return Response.json(
      await getQuoteFlowTemplate(user.organizationId, z.uuid().parse(id)),
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
    await requireOrganizationCapability(user, "quote_flows.manage");
    const raw = await request.text();
    if (raw.length > 2_000_000)
      throw new HttpError(413, "Quote flow template data is too large.");
    const { id } = await context.params;
    const input = updateInput.parse(JSON.parse(raw));
    const template = await updateQuoteFlowTemplate(
      user,
      z.uuid().parse(id),
      input,
    );
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "quote_flow_template",
      entityId: template.id,
      subject: `Updated quote flow ${template.name}`,
      afterData: {
        revision: template.revision,
        stageCount: template.definition.stages.length,
      },
    });
    return Response.json(template, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "quote_flows.manage");
    const { id } = await context.params;
    const input = archiveInput.parse(await request.json());
    const template = await setQuoteFlowTemplateArchived(
      user,
      z.uuid().parse(id),
      input.archived,
    );
    await recordAuditEvent(user, {
      action: input.archived ? "deleted" : "updated",
      entityKind: "quote_flow_template",
      entityId: template.id,
      subject: `${input.archived ? "Archived" : "Restored"} quote flow ${template.name}`,
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
    await requireOrganizationCapability(user, "quote_flows.manage");
    const { id } = await context.params;
    const template = await setQuoteFlowTemplateArchived(
      user,
      z.uuid().parse(id),
      true,
    );
    await recordAuditEvent(user, {
      action: "deleted",
      entityKind: "quote_flow_template",
      entityId: template.id,
      subject: `Archived quote flow ${template.name}`,
    });
    return Response.json(template, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
