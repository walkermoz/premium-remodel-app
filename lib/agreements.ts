import "server-only";

import { HttpError } from "./auth";
import { isOriginalOrganization } from "./original-organization";

/** The existing MSA names Premium Remodel's legal entity and payment address. */
export function premiumAgreementEnabled(organizationId: string) {
  return isOriginalOrganization(organizationId);
}

export function requirePremiumAgreement(organizationId: string) {
  if (!premiumAgreementEnabled(organizationId))
    throw new HttpError(
      403,
      "This business does not have an agreement template configured.",
    );
}
