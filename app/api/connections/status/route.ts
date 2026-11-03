import { apiError, requireUser } from "@/lib/auth";
import { getOrganizationConnectionRegistry } from "@/lib/organization-connections.server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await getOrganizationConnectionRegistry(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
