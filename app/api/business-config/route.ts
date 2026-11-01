import { apiError, checkOrigin, requireUser } from "@/lib/auth";
import {
  businessConfigSchema,
  getBusinessConfig,
  saveBusinessConfig,
} from "@/lib/business-config";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

function changed(left: unknown, right: unknown) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await getBusinessConfig(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const input = businessConfigSchema.parse(await request.json());
    const current = await getBusinessConfig(user);
    if (
      changed(current.profile, input.profile) ||
      changed(current.features, input.features) ||
      changed(current.modules, input.modules) ||
      changed(current.regional, input.regional) ||
      changed(current.quotePreferences, input.quotePreferences)
    )
      await requireOrganizationCapability(user, "business.manage");
    if (changed(current.compliance, input.compliance))
      await requireOrganizationCapability(user, "compliance.manage");
    if (
      changed(current.roleNavigation, input.roleNavigation) ||
      changed(current.rolePermissions, input.rolePermissions)
    )
      await requireOrganizationCapability(user, "permissions.manage");
    return Response.json(await saveBusinessConfig(user, input));
  } catch (error) {
    return apiError(error);
  }
}
