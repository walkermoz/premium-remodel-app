import { cookies } from "next/headers";
import { apiError, appOrigin, checkOrigin, requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { stripeConnections } from "@/lib/stripe-payments";
import {
  disconnectStripeAccount,
  refreshStripeConnectAccount,
  stripeConnectAuthorization,
  stripeConnectConfigured,
  stripeConnectCookie,
  stripeConnectStatus,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const legacy = stripeConnections().find(
      (connection) => connection.organizationId === user.organizationId,
    );
    return Response.json(
      {
        platformConfigured: stripeConnectConfigured(),
        connection: legacy
          ? {
              provider: "stripe",
              mode: "direct_legacy",
              status: "active",
              displayName: "Existing Stripe account",
              chargesEnabled: true,
              payoutsEnabled: true,
              detailsSubmitted: true,
              managedByPlatform: true,
            }
          : await stripeConnectStatus(user.organizationId),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const connection = await refreshStripeConnectAccount(user.organizationId);
    return Response.json(
      { platformConfigured: stripeConnectConfigured(), connection },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const { url, cookie } = stripeConnectAuthorization(request, user);
    (await cookies()).set(stripeConnectCookie, cookie, {
      httpOnly: true,
      secure: new URL(appOrigin(request)).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
      priority: "high",
    });
    return Response.json(
      { url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    const result = await disconnectStripeAccount(user);
    await recordAuditEvent(user, {
      action: "deleted",
      entityKind: "payment_connection",
      subject: "Disconnected Stripe account",
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
