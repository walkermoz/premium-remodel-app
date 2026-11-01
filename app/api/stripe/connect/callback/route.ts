import { cookies } from "next/headers";
import { appOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import {
  connectStripeAccount,
  stripeConnectCookie,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const maxDuration = 60;

function settingsUrl(request: Request, result: string) {
  const url = new URL(appOrigin(request));
  url.search = new URLSearchParams({
    view: "Settings",
    stripe: result,
  }).toString();
  return url;
}

export async function GET(request: Request) {
  const jar = await cookies();
  const stateCookie = jar.get(stripeConnectCookie)?.value || "";
  jar.delete(stripeConnectCookie);
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const url = new URL(request.url);
    if (url.searchParams.get("error"))
      return Response.redirect(settingsUrl(request, "denied"), 302);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state || !stateCookie)
      return Response.redirect(settingsUrl(request, "expired"), 302);
    const connected = await connectStripeAccount(
      request,
      user,
      code,
      state,
      stateCookie,
    );
    await recordAuditEvent(user, {
      action: "created",
      entityKind: "payment_connection",
      entityId: connected.id,
      subject: "Connected Stripe account",
      afterData: {
        accountId: connected.accountId,
        status: connected.status,
      },
    });
    return Response.redirect(settingsUrl(request, "connected"), 302);
  } catch {
    return Response.redirect(settingsUrl(request, "error"), 302);
  }
}
