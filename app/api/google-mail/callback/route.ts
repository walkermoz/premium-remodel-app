import { cookies } from "next/headers";
import { appOrigin, requireUser } from "@/lib/auth";
import { connectGoogleMail, googleMailCookie } from "@/lib/google-mail";
import {
  connectGoogleCalendar,
  GoogleCalendarError,
  googleCalendarOAuthCookie,
  googleCalendarUsesMailCallback,
  matchesGoogleCalendarOAuthState,
} from "@/lib/google-calendar";

export const runtime = "nodejs";
export const maxDuration = 60;

function settingsUrl(
  request: Request,
  integration: "mail" | "calendar",
  result: string,
) {
  const url = new URL(appOrigin(request));
  url.search = new URLSearchParams({
    view: "Settings",
    [integration]: result,
  }).toString();
  return url;
}

export async function GET(request: Request) {
  const jar = await cookies();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const calendarCookie = jar.get(googleCalendarOAuthCookie)?.value || "";
  const calendarRequest =
    googleCalendarUsesMailCallback() &&
    matchesGoogleCalendarOAuthState(calendarCookie, state);
  const integration = calendarRequest ? "calendar" : "mail";
  const stateCookie = calendarRequest
    ? calendarCookie
    : jar.get(googleMailCookie)?.value || "";
  jar.delete(calendarRequest ? googleCalendarOAuthCookie : googleMailCookie);
  try {
    const user = await requireUser();
    if (url.searchParams.get("error"))
      return Response.redirect(
        settingsUrl(request, integration, "denied"),
        302,
      );
    const code = url.searchParams.get("code") || "";
    if (!code || !state || !stateCookie)
      return Response.redirect(
        settingsUrl(request, integration, "expired"),
        302,
      );
    if (calendarRequest)
      await connectGoogleCalendar(request, user, code, state, stateCookie);
    else await connectGoogleMail(request, user, code, state, stateCookie);
    return Response.redirect(
      settingsUrl(request, integration, "connected"),
      302,
    );
  } catch (error) {
    const result =
      integration === "calendar" &&
      error instanceof GoogleCalendarError &&
      error.status === 503
        ? "setup"
        : "error";
    return Response.redirect(settingsUrl(request, integration, result), 302);
  }
}
