import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth";
import { listWorkflowRuns } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const { id } = await context.params;
    const offset = Math.max(
      0,
      Math.min(
        10_000,
        Number(new URL(request.url).searchParams.get("offset")) || 0,
      ),
    );
    return Response.json(
      await listWorkflowRuns(user.organizationId, z.uuid().parse(id), offset),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
