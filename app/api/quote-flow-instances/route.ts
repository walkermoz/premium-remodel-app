import { z } from "zod";
import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import {
  createQuoteFlowInstance,
  getQuoteFlowInstance,
  withoutStaffOnlyQuoteFlowContent,
} from "@/lib/quote-flow-instances";
import { hasOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const quoteId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("quoteId"));
    const [instance, canViewStaffContent] = await Promise.all([
      getQuoteFlowInstance(user.organizationId, { quoteId }, user),
      hasOrganizationCapability(user, "quote_flows.staff_content.view"),
    ]);
    return Response.json(
      {
        instance:
          instance && !canViewStaffContent
            ? withoutStaffOnlyQuoteFlowContent(instance)
            : instance,
      },
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
    await requireWorkspaceTabs(user, "Quotes");
    const input = z
      .object({ quoteId: z.uuid(), templateId: z.uuid().optional() })
      .parse(await request.json());
    const [instance, canViewStaffContent] = await Promise.all([
      createQuoteFlowInstance(user, input),
      hasOrganizationCapability(user, "quote_flows.staff_content.view"),
    ]);
    return Response.json(
      canViewStaffContent
        ? instance
        : withoutStaffOnlyQuoteFlowContent(instance),
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
