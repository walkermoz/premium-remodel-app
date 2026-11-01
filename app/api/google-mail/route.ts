import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import { disconnectGoogleMail, googleMailStatus } from "@/lib/google-mail";
import {
  hasOrganizationCapability,
  requireOrganizationCapability,
} from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const status = await googleMailStatus(user);
    const canManage = await hasOrganizationCapability(
      user,
      "connections.manage",
    );
    // Quote senders only need to know whether a mailbox is connected.
    return Response.json(
      canManage ? status : { connected: status.connected },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
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
    return Response.json(await disconnectGoogleMail(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
