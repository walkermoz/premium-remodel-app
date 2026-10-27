import "server-only";
import { supabaseAdmin } from "./supabase/server";
import type { WorkspaceUser } from "./auth";
import {
  businessConfigSchema,
  navigationPages,
  type BusinessConfig,
} from "./business-config-schema";
import { premiumAgreementEnabled } from "./agreements";
import { isOriginalOrganization } from "./original-organization";
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
  const [organization, saved] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single(),
    admin
      .from("remodel_business_config")
      .select("profile,features,quote_preferences,navigation")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);
  if (organization.error) throw organization.error;
  if (saved.error) throw saved.error;
  const defaults = defaultBusinessConfig(
    organization.data.name,
    organizationId,
  );
  if (!saved.data) return defaults;
  return businessConfigSchema.parse({
    profile: { ...defaults.profile, ...saved.data.profile },
    features: {
      ...defaults.features,
      ...saved.data.features,
      agreements: premiumAgreementEnabled(organizationId),
      twilio: isOriginalOrganization(organizationId),
    },
    quotePreferences: {
      ...defaults.quotePreferences,
      ...saved.data.quote_preferences,
    },
    navigation: saved.data.navigation?.length
      ? saved.data.navigation
      : defaults.navigation,
  });
}

export async function saveBusinessConfig(
  user: WorkspaceUser,
  input: BusinessConfig,
) {
  const config = businessConfigSchema.parse(input);
  // A copied Premium Remodel legal template must never be presented as another company's agreement.
  config.features.agreements = premiumAgreementEnabled(user.organizationId);
  config.features.twilio = isOriginalOrganization(user.organizationId);
  const { error } = await supabaseAdmin()
    .from("remodel_business_config")
    .upsert({
      organization_id: user.organizationId,
      version: 1,
      profile: config.profile,
      features: config.features,
      quote_preferences: config.quotePreferences,
      navigation: config.navigation,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
  return config;
}
