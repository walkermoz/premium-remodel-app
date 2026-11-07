import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import {
  disconnectGoogleBusiness,
  googleBusinessStatus,
} from "@/lib/google-business";
import {
  hasOrganizationCapability,
  requireOrganizationCapability,
} from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const canManage = await hasOrganizationCapability(
      user,
      "connections.manage",
    );
    return Response.json(
      await googleBusinessStatus(user.organizationId, canManage),
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
    await disconnectGoogleBusiness(user);
    return Response.json(
      { connected: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
