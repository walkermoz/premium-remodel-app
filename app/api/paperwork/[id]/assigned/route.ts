import { apiError, appOrigin, checkOrigin, requireUser } from "@/lib/auth";
import { startAssignedPaperwork } from "@/lib/paperwork";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    return Response.json(
      await startAssignedPaperwork(user, (await params).id, appOrigin(request)),
    );
  } catch (error) {
    return apiError(error);
  }
}
