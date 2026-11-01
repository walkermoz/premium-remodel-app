import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { workflowDefinitionSchema } from "@/lib/workflows/schema";
import { getWorkflow, saveWorkflowDraft } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

const updateInput = z.object({
  revision: z.number().int().min(0),
  definition: workflowDefinitionSchema,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2_000).optional(),
  changeNote: z.string().trim().max(500).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const { id } = await context.params;
    return Response.json(
      await getWorkflow(user.organizationId, z.uuid().parse(id)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    const { id } = await context.params;
    const input = updateInput.parse(await request.json());
    return Response.json(
      await saveWorkflowDraft(user, z.uuid().parse(id), input),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
