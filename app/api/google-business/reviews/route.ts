import { apiError, HttpError, limitAttempts, requireUser } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import { listGoogleBusinessReviews } from "@/lib/google-business";
import { canOpenWorkspaceTab } from "@/lib/workspace-tab-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (
      !canOpenWorkspaceTab(
        await getBusinessConfig(user),
        user.group,
        "Analytics",
      )
    )
      throw new HttpError(403, "Analytics is not available to this role.");
    await limitAttempts(
      `google-business-reviews:${user.organizationId}:${user.id}`,
      45,
    );
    const pageToken = new URL(request.url).searchParams.get("pageToken") || "";
    if (pageToken.length > 1_024)
      throw new HttpError(400, "Invalid Google review page.");
    return Response.json(
      await listGoogleBusinessReviews(user.organizationId, pageToken),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
