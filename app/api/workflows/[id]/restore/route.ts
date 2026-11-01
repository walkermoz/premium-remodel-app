import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { restoreWorkflowVersion } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const inputSchema = z.object({
  versionId: z.uuid(),
  revision: z.number().int().min(0),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can restore workflows.");
    const { id } = await context.params;
    return Response.json(
      await restoreWorkflowVersion(
        user,
        z.uuid().parse(id),
        inputSchema.parse(await request.json()),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
