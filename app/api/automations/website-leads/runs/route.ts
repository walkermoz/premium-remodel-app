import { z } from "zod";
import { apiError, requireUser } from "@/lib/auth";
import { listWebsiteLeadRuns } from "@/lib/automation-runs";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000)
      .parse(new URL(request.url).searchParams.get("offset") || "0");
    return Response.json(
      await listWebsiteLeadRuns(user.organizationId, offset),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
