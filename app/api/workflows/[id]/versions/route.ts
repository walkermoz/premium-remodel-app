import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth";
import { listWorkflowVersions } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const { id } = await context.params;
    return Response.json(
      {
        versions: await listWorkflowVersions(
          user.organizationId,
          z.uuid().parse(id),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
