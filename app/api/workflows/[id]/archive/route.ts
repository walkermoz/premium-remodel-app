import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { archiveWorkflow } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    const { id } = await context.params;
    return Response.json(await archiveWorkflow(user, z.uuid().parse(id)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
