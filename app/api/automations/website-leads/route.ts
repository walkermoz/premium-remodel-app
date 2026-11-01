import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { websiteLeadAutomationSchema } from "@/lib/automation-config";
import {
  getWebsiteLeadAutomation,
  saveWebsiteLeadAutomation,
} from "@/lib/automation-store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    return Response.json(await getWebsiteLeadAutomation(user.organizationId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    const input = websiteLeadAutomationSchema.parse(await request.json());
    return Response.json(await saveWebsiteLeadAutomation(user, input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
