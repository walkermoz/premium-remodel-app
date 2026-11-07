import { z } from "zod";
import { apiError, checkOrigin, limitAttempts, requireUser } from "@/lib/auth";
import { replyToGoogleBusinessReview } from "@/lib/google-business";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    await limitAttempts(
      `google-business-replies:${user.organizationId}:${user.id}`,
      20,
    );
    const { reviewId, comment } = z
      .object({
        reviewId: z.string().min(1).max(250),
        comment: z.string().min(1).max(4096),
      })
      .strict()
      .parse(await request.json());
    return Response.json(
      await replyToGoogleBusinessReview(user, reviewId, comment),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
