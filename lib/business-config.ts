import "server-only";
import { supabaseAdmin } from "./supabase/server";
import type { WorkspaceUser } from "./auth";
import {
  businessConfigSchema,
  defaultRolePermissions,
  defaultRoleNavigation,
  navigationFromRoles,
  navigationPages,
  type BusinessConfig,
  type NavigationPage,
} from "./business-config-schema";
import { premiumAgreementEnabled } from "./agreements";
import { isOriginalOrganization } from "./original-organization";
import { hasTwilioConnection } from "./twilio-connection-store";
import { workspaceGroups } from "./types";
export { businessConfigSchema } from "./business-config-schema";
export type { BusinessConfig } from "./business-config-schema";

export function defaultBusinessConfig(
  name = "Premium Remodel",
  organizationId?: string,
): BusinessConfig {
  const premium = organizationId
    ? premiumAgreementEnabled(organizationId)
    : name.trim().toLowerCase() === "premium remodel";
  return {
    profile: {
      name,
      website: premium ? "https://premiumremodel.com" : "",
      email: premium ? "contact@premiumremodel.com" : "",
      phone: premium ? "(919) 454-4012" : "",
      addressPriority: premium ? "wake" : "nationwide",
      logoUrl: premium ? "/images/logo.png" : "",
      logoDarkUrl: "",
      logoMarkUrl: "",
      bannerUrl: "",
    },
    features: {
      // Premium Remodel already uses the price book in its live quoting flow.
      // Keep that existing organization behavior while new organizations opt in.
      priceBook: premium,
      payments: premium,
      doorKnocking: true,
      imageGeneration: true,
      agreements: organizationId
        ? premiumAgreementEnabled(organizationId)
        : premium,
      twilio: organizationId ? isOriginalOrganization(organizationId) : premium,
    },
    modules: {
      priceBook: premium,
      payments: premium,
      doorKnocking: true,
      imageGeneration: true,
      automations: premium,
      agreements: premium,
    },
    compliance: {
      legalName: premium
        ? "Premium Living Home Improvement LLC d/b/a Premium Remodel"
        : "",
      smsProgramName: premium ? "Premium Remodel" : "",
      privacyUrl: premium
        ? "https://www.premiumremodel.com/privacy-policy"
        : "",
      termsUrl: premium
        ? "https://www.premiumremodel.com/terms-and-conditions"
        : "",
      smsPolicyVersion: premium ? "2026-10-21" : "",
      helpEmail: premium ? "contact@premiumremodel.com" : "",
      helpPhone: premium ? "(919) 454-4012" : "",
      checkPayee: premium
        ? "Premium Living Home Improvement LLC d/b/a Premium Remodel"
        : "",
      checkMailingAddress: premium
        ? "309 Amiable Loop, Cary, North Carolina 27519"
        : "",
    },
    regional: {
      country: "US",
      currency: "USD",
      locale: "en-US",
      timezone: "America/New_York",
      serviceArea: premium ? "Wake County, North Carolina" : "",
    },
    quotePreferences: {
      showInternalCosts: true,
      showPriceBookPicker: premium,
      showCustomerLineItemPrices: !premium,
      paymentProvider: premium ? "stripe" : "manual",
    },
    navigation: [...navigationPages],
    roleNavigation: defaultRoleNavigation(),
    rolePermissions: defaultRolePermissions(),
  };
}

export async function getBusinessConfig(
  user: WorkspaceUser,
): Promise<BusinessConfig> {
  return getBusinessConfigForOrganization(user.organizationId);
}

export async function getBusinessConfigForOrganization(
  organizationId: string,
): Promise<BusinessConfig> {
  const admin = supabaseAdmin();
  const [organization, saved, twilioConnected] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single(),
    admin
      .from("remodel_business_config")
      .select(
        "profile,features,modules,compliance,regional,quote_preferences,navigation,role_navigation,role_permissions",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    hasTwilioConnection(organizationId),
  ]);
  if (organization.error) throw organization.error;
  if (saved.error) throw saved.error;
  const defaults = defaultBusinessConfig(
    organization.data.name,
    organizationId,
  );
  defaults.features.twilio = twilioConnected;
  if (!saved.data) return defaults;
  const legacyNavigation = saved.data.navigation?.length
    ? saved.data.navigation
    : defaults.navigation;
  const savedRoles = saved.data.role_navigation || {};
  const roleNavigation = Object.fromEntries(
    workspaceGroups.map((group) => {
      const configured =
        (savedRoles[group] as NavigationPage[] | undefined) ||
        defaults.roleNavigation[group];
      const effective = configured.filter((page) =>
        legacyNavigation.includes(page),
      );
      if (!effective.includes("Settings")) effective.push("Settings");
      return [group, effective];
    }),
  ) as BusinessConfig["roleNavigation"];
  const savedPermissions = saved.data.role_permissions || {};
  const rolePermissions = Object.fromEntries(
    workspaceGroups.map((group) => [
      group,
      (savedPermissions[
        group
      ] as BusinessConfig["rolePermissions"][typeof group]) ||
        defaults.rolePermissions[group],
    ]),
  ) as BusinessConfig["rolePermissions"];
  const modules = {
    ...defaults.modules,
    ...(saved.data.modules || {}),
  };
  return businessConfigSchema.parse({
    profile: { ...defaults.profile, ...saved.data.profile },
    features: {
      ...defaults.features,
      ...saved.data.features,
      agreements: premiumAgreementEnabled(organizationId),
      twilio: twilioConnected,
    },
    modules,
    compliance: { ...defaults.compliance, ...saved.data.compliance },
    regional: { ...defaults.regional, ...saved.data.regional },
    quotePreferences: {
      ...defaults.quotePreferences,
      ...saved.data.quote_preferences,
    },
    navigation: navigationFromRoles(roleNavigation),
    roleNavigation,
    rolePermissions,
  });
}

export async function saveBusinessConfig(
  user: WorkspaceUser,
  input: BusinessConfig,
) {
  const config = businessConfigSchema.parse(input);
  config.navigation = navigationFromRoles(config.roleNavigation);
  // Owners are the recovery role and must never be locked out by a malformed
  // or overly restrictive permission edit.
  config.rolePermissions.owner = defaultRolePermissions().owner;
  // The current Premium MSA execution path remains tenant-restricted. The
  // separate agreement module activates the organization's own library.
  config.features.agreements = premiumAgreementEnabled(user.organizationId);
  config.features.priceBook = config.modules.priceBook;
  config.features.payments = config.modules.payments;
  config.features.doorKnocking = config.modules.doorKnocking;
  config.features.imageGeneration = config.modules.imageGeneration;
  config.features.twilio = await hasTwilioConnection(user.organizationId);
  const { error } = await supabaseAdmin()
    .from("remodel_business_config")
    .upsert({
      organization_id: user.organizationId,
      version: 1,
      profile: config.profile,
      features: config.features,
      modules: config.modules,
      compliance: config.compliance,
      regional: config.regional,
      quote_preferences: config.quotePreferences,
      navigation: config.navigation,
      role_navigation: config.roleNavigation,
      role_permissions: config.rolePermissions,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return config;
}
