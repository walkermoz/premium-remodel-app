import "server-only";
import { supabaseAdmin } from "./supabase/server";
import type { WorkspaceUser } from "./auth";
import {
  businessConfigSchema,
  defaultRoleNavigation,
  navigationPages,
  type BusinessConfig,
} from "./business-config-schema";
import { premiumAgreementEnabled } from "./agreements";
import { isOriginalOrganization } from "./original-organization";
import { hasTwilioConnection } from "./twilio-connection-store";
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
    navigation: saved.data.navigation?.length
      ? saved.data.navigation
      : defaults.navigation,
    roleNavigation: {
      ...defaults.roleNavigation,
      ...(saved.data.role_navigation || {}),
    },
  });
}

export async function saveBusinessConfig(
  user: WorkspaceUser,
  input: BusinessConfig,
) {
  const config = businessConfigSchema.parse(input);
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
