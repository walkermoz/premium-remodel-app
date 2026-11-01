import { cookies } from "next/headers";
import { apiError, appOrigin, requireUser } from "@/lib/auth";
import { googleMailAuthorization, googleMailCookie } from "@/lib/google-mail";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const { url, cookie } = googleMailAuthorization(request, user);
    (await cookies()).set(googleMailCookie, cookie, {
      httpOnly: true,
      secure: new URL(appOrigin(request)).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
      priority: "high",
    });
    return Response.redirect(url, 302);
  } catch (error) {
    return apiError(error);
  }
}
