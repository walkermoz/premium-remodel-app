import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { workflowObjectTypeSchema } from "@/lib/workflows/schema";
import { createWorkflow, listWorkflows } from "@/lib/workflows/store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

const createInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  primaryObjectType: workflowObjectTypeSchema,
  template: z
    .enum([
      "blank",
      "lead-follow-up",
      "project-item-handoff",
      "invoice-payment-reminders",
    ])
    .default("blank"),
});

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    return Response.json(
      { workflows: await listWorkflows(user.organizationId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    const input = createInput.parse(await request.json());
    return Response.json(await createWorkflow(user, input), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
