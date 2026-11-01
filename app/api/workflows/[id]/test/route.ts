import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { workflowEventSchema } from "@/lib/workflows/schema";
import { simulateWorkflow } from "@/lib/workflows/simulator";
import { getWorkflow } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const inputSchema = z.object({
  event: workflowEventSchema,
  context: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const { id } = await context.params;
    const workflow = await getWorkflow(user.organizationId, z.uuid().parse(id));
    const input = inputSchema.parse(await request.json());
    if (input.event.organizationId !== user.organizationId)
      input.event.organizationId = user.organizationId;
    return Response.json(
      simulateWorkflow(workflow.draft, input.event, input.context),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
