import "server-only";

import type { WorkspaceUser } from "./auth";
import { HttpError } from "./auth";
import { getBusinessConfigForOrganization } from "./business-config";
import type { OrganizationCapability } from "./business-config-schema";

const capabilityModules: Partial<
  Record<OrganizationCapability, "automations" | "agreements" | "payments" | "priceBook" | "imageGeneration">
> = {
  "workflows.manage": "automations",
  "agreements.manage": "agreements",
  "payments.manage": "payments",
  "pricebook.manage": "priceBook",
  "generation.manage": "imageGeneration",
};

const moduleLabels: Record<NonNullable<(typeof capabilityModules)[OrganizationCapability]>, string> = {
  automations: "Automations",
  agreements: "Agreements",
  payments: "Payments",
  priceBook: "Price book",
  imageGeneration: "Image generation",
};

export async function hasOrganizationCapability(
  user: Pick<WorkspaceUser, "organizationId" | "group">,
  capability: OrganizationCapability,
) {
  // Owners are the immutable recovery role for an organization. Their access
  // cannot be removed by an accidentally restrictive role configuration.
  if (user.group === "owner") return true;
  const config = await getBusinessConfigForOrganization(user.organizationId);
  return config.rolePermissions[user.group].includes(capability);
}

export async function requireOrganizationCapability(
  user: Pick<WorkspaceUser, "organizationId" | "group">,
  capability: OrganizationCapability,
) {
  const config = await getBusinessConfigForOrganization(user.organizationId);
  const permitted =
    user.group === "owner" ||
    config.rolePermissions[user.group].includes(capability);
  if (!permitted)
    throw new HttpError(
      403,
      "Your workspace role does not have permission to manage this setting.",
    );
  const moduleKey = capabilityModules[capability];
  if (moduleKey && !config.modules[moduleKey])
    throw new HttpError(
      409,
      `${moduleLabels[moduleKey]} is disabled for this business. Enable it in Business modules first.`,
    );
}
