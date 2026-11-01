import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { publishWorkflow } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const inputSchema = z.object({
  revision: z.number().int().min(0),
  changeNote: z.string().trim().max(500).optional(),
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
      throw new HttpError(403, "Only administrators can publish workflows.");
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    return Response.json(
      await publishWorkflow(user, z.uuid().parse(id), input),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
