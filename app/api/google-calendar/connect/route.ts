import { cookies } from "next/headers";
import { apiError, appOrigin, requireUser } from "@/lib/auth";
import {
  googleAuthorizationRequest,
  googleCalendarOAuthCookie,
} from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { url, cookie } = googleAuthorizationRequest(request, user);
    (await cookies()).set(googleCalendarOAuthCookie, cookie, {
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
