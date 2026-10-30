import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { websiteLeadAutomationSchema } from "@/lib/automation-config";
import {
  getWebsiteLeadAutomation,
  saveWebsiteLeadAutomation,
} from "@/lib/automation-store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

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
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can change automations.");
    const input = websiteLeadAutomationSchema.parse(await request.json());
    return Response.json(await saveWebsiteLeadAutomation(user, input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
