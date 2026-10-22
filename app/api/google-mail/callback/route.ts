import { cookies } from "next/headers";
import { appOrigin, requireUser } from "@/lib/auth";
import { connectGoogleMail, googleMailCookie } from "@/lib/google-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

function settingsUrl(request: Request, result: string) {
  const url = new URL(appOrigin(request));
  url.search = new URLSearchParams({ view: "Settings", mail: result }).toString();
  return url;
}

export async function GET(request: Request) {
  const jar = await cookies();
  const stateCookie = jar.get(googleMailCookie)?.value || "";
  jar.delete(googleMailCookie);
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    if (url.searchParams.get("error"))
      return Response.redirect(settingsUrl(request, "denied"), 302);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state || !stateCookie)
      return Response.redirect(settingsUrl(request, "expired"), 302);
    await connectGoogleMail(request, user, code, state, stateCookie);
    return Response.redirect(settingsUrl(request, "connected"), 302);
  } catch {
    return Response.redirect(settingsUrl(request, "error"), 302);
  }
}
