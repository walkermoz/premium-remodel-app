import "server-only";
import { supabaseAdmin } from "./supabase/server";
import type { WorkspaceUser } from "./auth";
import {
  businessConfigSchema,
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
      priceBook: false,
      payments: premium,
      doorKnocking: true,
      imageGeneration: true,
      agreements: organizationId
        ? premiumAgreementEnabled(organizationId)
        : premium,
      twilio: organizationId ? isOriginalOrganization(organizationId) : premium,
    },
    quotePreferences: {
      showInternalCosts: true,
      showPriceBookPicker: false,
      showCustomerLineItemPrices: !premium,
      paymentProvider: premium ? "stripe" : "manual",
    },
    navigation: [...navigationPages],
    roleNavigation: defaultRoleNavigation(),
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
      .select("profile,features,quote_preferences,navigation,role_navigation")
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
  return businessConfigSchema.parse({
    profile: { ...defaults.profile, ...saved.data.profile },
    features: {
      ...defaults.features,
      ...saved.data.features,
      agreements: premiumAgreementEnabled(organizationId),
      twilio: twilioConnected,
    },
    quotePreferences: {
      ...defaults.quotePreferences,
      ...saved.data.quote_preferences,
    },
    navigation: navigationFromRoles(roleNavigation),
    roleNavigation,
  });
}

export async function saveBusinessConfig(
  user: WorkspaceUser,
  input: BusinessConfig,
) {
  const config = businessConfigSchema.parse(input);
  config.navigation = navigationFromRoles(config.roleNavigation);
  // A copied Premium Remodel legal template must never be presented as another company's agreement.
  config.features.agreements = premiumAgreementEnabled(user.organizationId);
  config.features.twilio = await hasTwilioConnection(user.organizationId);
  const { error } = await supabaseAdmin()
    .from("remodel_business_config")
    .upsert({
      organization_id: user.organizationId,
      version: 1,
      profile: config.profile,
      features: config.features,
      quote_preferences: config.quotePreferences,
      navigation: config.navigation,
      role_navigation: config.roleNavigation,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return config;
}
