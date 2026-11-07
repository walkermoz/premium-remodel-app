import { cookies } from "next/headers";
import { appOrigin, requireUser } from "@/lib/auth";
import {
  connectGoogleBusiness,
  googleBusinessCookie,
} from "@/lib/google-business";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

function analyticsUrl(request: Request, result: string) {
  const url = new URL(appOrigin(request));
  url.search = new URLSearchParams({
    view: "Analytics",
    googleBusiness: result,
  }).toString();
  return url;
}

export async function GET(request: Request) {
  const jar = await cookies();
  const stateCookie = jar.get(googleBusinessCookie)?.value || "";
  jar.delete(googleBusinessCookie);
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const url = new URL(request.url);
    if (url.searchParams.get("error"))
      return Response.redirect(analyticsUrl(request, "denied"), 302);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state || !stateCookie)
      return Response.redirect(analyticsUrl(request, "expired"), 302);
    await connectGoogleBusiness(request, user, code, state, stateCookie);
    return Response.redirect(analyticsUrl(request, "connected"), 302);
  } catch {
    return Response.redirect(analyticsUrl(request, "error"), 302);
  }
}
