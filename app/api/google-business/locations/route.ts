import { z } from "zod";
import { apiError, checkOrigin, limitAttempts, requireUser } from "@/lib/auth";
import {
  listGoogleBusinessLocations,
  selectGoogleBusinessLocation,
} from "@/lib/google-business";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    await limitAttempts(
      `google-business-locations:${user.organizationId}:${user.id}`,
      20,
    );
    return Response.json(
      { locations: await listGoogleBusinessLocations(user.organizationId) },
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
    await limitAttempts(
      `google-business-select:${user.organizationId}:${user.id}`,
      20,
    );
    const { accountName, locationName } = z
      .object({
        accountName: z.string().max(100),
        locationName: z.string().max(100),
      })
      .strict()
      .parse(await request.json());
    return Response.json(
      await selectGoogleBusinessLocation(user, accountName, locationName),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
