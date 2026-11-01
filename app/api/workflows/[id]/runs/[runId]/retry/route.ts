import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { retryWorkflowRun } from "@/lib/workflows/engine";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

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
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can retry workflow actions.",
      );
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
