import { z } from "zod";
import { workspaceGroups } from "./types";

export const navigationPages = [
  "Overview",
  "Projects",
  "Quotes",
  "Price book",
  "Leads",
  "Automation",
  "Contacts",
  "Door knocking",
  "Upcoming",
  "Contractors",
  "Generate",
  "Team map",
  "Team",
  "Settings",
] as const;
export type NavigationPage = (typeof navigationPages)[number];
export const doorKnockerPages: NavigationPage[] = [
  "Door knocking",
  "Upcoming",
  "Team map",
  "Settings",
];

export const organizationCapabilities = [
  "business.manage",
  "branding.manage",
  "team.manage",
  "permissions.manage",
  "connections.manage",
  "secrets.manage",
  "workflows.manage",
  "agreements.manage",
  "payments.manage",
  "compliance.manage",
  "audit.view",
  "alerts.manage",
  "api_keys.manage",
  "pricebook.manage",
  "quotes.manage",
  "generation.manage",
  "locations.view",
] as const;

export const organizationPaymentProviderIds = ["manual", "stripe"] as const;
export type OrganizationPaymentProviderId =
  (typeof organizationPaymentProviderIds)[number];
export type OrganizationCapability = (typeof organizationCapabilities)[number];

export const organizationCapabilityLabels: Record<
  OrganizationCapability,
  { label: string; description: string }
> = {
  "business.manage": {
    label: "Business settings",
    description: "Edit company details, regional settings, and quote defaults.",
  },
  "branding.manage": {
    label: "Brand assets",
    description: "Upload and remove logos, marks, and portal banners.",
  },
  "team.manage": {
    label: "Team",
    description: "Invite people, remove access, and manage team profiles.",
  },
  "permissions.manage": {
    label: "Roles and permissions",
    description: "Control what each workspace role is allowed to manage.",
  },
  "connections.manage": {
    label: "Connections",
    description: "Connect company email, phone, payment, and external tools.",
  },
  "secrets.manage": {
    label: "Workflow secrets",
    description: "Create, rotate, and remove encrypted workflow credentials.",
  },
  "workflows.manage": {
    label: "Automations",
    description: "Create, edit, test, and publish workflows.",
  },
  "agreements.manage": {
    label: "Agreements",
    description: "Create templates and manage signing configuration.",
  },
  "payments.manage": {
    label: "Payments",
    description: "Manage payment providers and payment instructions.",
  },
  "compliance.manage": {
    label: "Communication compliance",
    description: "Manage consent wording, policies, and legal contact details.",
  },
  "audit.view": {
    label: "Workspace history",
    description: "Review the organization audit trail and record changes.",
  },
  "alerts.manage": {
    label: "Workspace alerts",
    description: "Create and remove alerts shown to workspace roles.",
  },
  "api_keys.manage": {
    label: "Admin API keys",
    description: "Create, scope, and revoke organization API keys.",
  },
  "pricebook.manage": {
    label: "Price book",
    description: "Create, edit, archive, and organize price-book items.",
  },
  "quotes.manage": {
    label: "Quote administration",
    description: "Manage customer portal links and locked quote operations.",
  },
  "generation.manage": {
    label: "Image generation",
    description: "Choose organization defaults for generated concepts.",
  },
  "locations.view": {
    label: "Team locations",
    description: "View current location-sharing positions for the organization.",
  },
};

export function defaultRolePermissions(): Record<
  (typeof workspaceGroups)[number],
  OrganizationCapability[]
> {
  return Object.fromEntries(
    workspaceGroups.map((group) => [
      group,
      group === "owner" || group === "admin"
        ? [...organizationCapabilities]
        : [],
    ]),
  ) as Record<(typeof workspaceGroups)[number], OrganizationCapability[]>;
}

export function navigationFromRoles(
  roles: Record<(typeof workspaceGroups)[number], NavigationPage[]>,
): NavigationPage[] {
  return navigationPages.filter((page) =>
    workspaceGroups.some((group) => roles[group].includes(page)),
  );
}

export function defaultRoleNavigation(): Record<
  (typeof workspaceGroups)[number],
  NavigationPage[]
> {
  return Object.fromEntries(
    workspaceGroups.map((group) => [
      group,
      group === "doorknocker"
        ? [...doorKnockerPages]
        : navigationPages.filter((page) => page !== "Door knocking"),
    ]),
  ) as Record<(typeof workspaceGroups)[number], NavigationPage[]>;
}

const brandAssetUrl = (asset: "logo-dark" | "logo-mark" | "banner") =>
  z
    .string()
    .max(500)
    .refine(
      (value) =>
        value === "" ||
        value === `/api/business-branding/${asset}` ||
        /^https:\/\//i.test(value),
      "Use an HTTPS image URL or an uploaded brand asset.",
    )
    .default("");

export const businessConfigSchema = z.object({
  profile: z.object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(
        (value) => !/[\x00-\x1f\x7f]/.test(value),
        "Name cannot contain control characters.",
      ),
    website: z
      .union([
        z
          .url()
          .refine(
            (value) => /^https?:\/\//i.test(value),
            "Use an HTTP or HTTPS website URL.",
          ),
        z.literal(""),
      ])
      .default(""),
    email: z.union([z.email(), z.literal("")]).default(""),
    phone: z.string().max(40).default(""),
    addressPriority: z.enum(["wake", "nationwide"]).default("nationwide"),
    logoUrl: z
      .string()
      .max(500)
      .refine(
        (value) =>
          value === "" || value.startsWith("/") || /^https:\/\//i.test(value),
        "Use an HTTPS logo URL or an app-relative path.",
      )
      .default("/images/logo.png"),
    logoDarkUrl: brandAssetUrl("logo-dark"),
    logoMarkUrl: brandAssetUrl("logo-mark"),
    bannerUrl: brandAssetUrl("banner"),
  }),
  features: z.object({
    priceBook: z.boolean().default(false),
    payments: z.boolean().default(true),
    doorKnocking: z.boolean().default(true),
    imageGeneration: z.boolean().default(true),
    agreements: z.boolean().default(false),
    twilio: z.boolean().default(false),
  }),
  modules: z.object({
    priceBook: z.boolean().default(false),
    payments: z.boolean().default(false),
    doorKnocking: z.boolean().default(true),
    imageGeneration: z.boolean().default(true),
    automations: z.boolean().default(false),
    agreements: z.boolean().default(false),
  }),
  compliance: z.object({
    legalName: z.string().trim().max(200).default(""),
    smsProgramName: z.string().trim().max(120).default(""),
    privacyUrl: z.union([z.url(), z.literal("")]).default(""),
    termsUrl: z.union([z.url(), z.literal("")]).default(""),
    smsPolicyVersion: z.string().trim().max(80).default(""),
    helpEmail: z.union([z.email(), z.literal("")]).default(""),
    helpPhone: z.string().trim().max(40).default(""),
    checkPayee: z.string().trim().max(200).default(""),
    checkMailingAddress: z.string().trim().max(500).default(""),
  }),
  regional: z.object({
    country: z.literal("US").default("US"),
    currency: z.literal("USD").default("USD"),
    locale: z.string().trim().min(2).max(40).default("en-US"),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((timezone) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA timezone."),
    serviceArea: z.string().trim().max(160).default(""),
  }),
  quotePreferences: z.object({
    showInternalCosts: z.boolean().default(true),
    showPriceBookPicker: z.boolean().default(false),
    showCustomerLineItemPrices: z.boolean().default(true),
    paymentProvider: z.enum(organizationPaymentProviderIds).default("stripe"),
  }),
  navigation: z
    .array(z.enum(navigationPages))
    .max(navigationPages.length)
    .refine(
      (items) => items.includes("Settings"),
      "Settings must remain in navigation.",
    ),
  roleNavigation: z
    .record(
      z.enum(workspaceGroups),
      z
        .array(z.enum(navigationPages))
        .max(navigationPages.length)
        .refine(
          (items) => new Set(items).size === items.length,
          "A tab can appear only once for each role.",
        )
        .refine(
          (items) => items.includes("Settings"),
          "Settings must remain available to every role.",
        ),
    )
    .refine(
      (roles) =>
        roles.doorknocker.every((page) => doorKnockerPages.includes(page)),
      "Door knockers can only use their field workspace tabs.",
    ),
  rolePermissions: z.record(
    z.enum(workspaceGroups),
    z
      .array(z.enum(organizationCapabilities))
      .max(organizationCapabilities.length)
      .refine(
        (items) => new Set(items).size === items.length,
        "A permission can appear only once for each role.",
      ),
  ),
});
export type BusinessConfig = z.infer<typeof businessConfigSchema>;
