import type { BusinessConfig } from "./business-config-schema";
/** Customer-facing identity and support destinations, shared by portals and emails. */
export function customerCompanyDetails(
  config: Pick<BusinessConfig, "profile" | "compliance">,
) {
  return {
    legalName: config.compliance.legalName.trim() || config.profile.name,
    supportEmail: config.compliance.helpEmail || config.profile.email,
    supportPhone: config.compliance.helpPhone || config.profile.phone,
  };
}
export function customerEmailBusiness(
  config: Pick<BusinessConfig, "profile" | "compliance">,
  fallbackEmail = "",
) {
  return {
    ...config.profile,
    ...customerCompanyDetails(config),
    email: config.profile.email || fallbackEmail,
  };
}
