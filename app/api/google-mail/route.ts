import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { disconnectGoogleMail, googleMailStatus } from "@/lib/google-mail";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await googleMailStatus(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    return Response.json(await disconnectGoogleMail(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
