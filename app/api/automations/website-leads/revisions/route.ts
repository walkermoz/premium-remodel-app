import { apiError, requireUser } from "@/lib/auth";
import { listWebsiteLeadAutomationRevisions } from "@/lib/automation-store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    return Response.json(
      {
        revisions: await listWebsiteLeadAutomationRevisions(
          user.organizationId,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
