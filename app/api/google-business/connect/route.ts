import { cookies } from "next/headers";
import { apiError, appOrigin, limitAttempts, requireUser } from "@/lib/auth";
import {
  googleBusinessAuthorization,
  googleBusinessCookie,
} from "@/lib/google-business";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    await limitAttempts(
      `google-business-connect:${user.organizationId}:${user.id}`,
      10,
    );
    const { url, cookie } = googleBusinessAuthorization(request, user);
    (await cookies()).set(googleBusinessCookie, cookie, {
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
