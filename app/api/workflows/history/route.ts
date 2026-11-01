import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth";
import { workflowObjectTypeSchema } from "@/lib/workflows/schema";
import { listObjectWorkflowRuns } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const querySchema = z.object({
  objectType: workflowObjectTypeSchema,
  objectId: z.string().trim().min(1).max(160),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const url = new URL(request.url);
    const query = querySchema.parse({
      objectType: url.searchParams.get("objectType"),
      objectId: url.searchParams.get("objectId"),
    });
    return Response.json(
      {
        runs: await listObjectWorkflowRuns(
          user.organizationId,
          query.objectType,
          query.objectId,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
