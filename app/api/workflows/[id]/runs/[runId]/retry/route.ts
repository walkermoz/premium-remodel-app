import { z } from "zod";
import { apiError, checkOrigin, limitAttempts, requireUser } from "@/lib/auth";
import { retryWorkflowRun } from "@/lib/workflows/engine";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    await limitAttempts(`workflow-retry:${user.id}`, 20);
    const { id, runId } = await context.params;
    const result = await retryWorkflowRun({
      organizationId: user.organizationId,
      workflowId: z.uuid().parse(id),
      runId: z.uuid().parse(runId),
    });
    return Response.json(
      { status: result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
