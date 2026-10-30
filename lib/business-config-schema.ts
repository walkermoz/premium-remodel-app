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
  quotePreferences: z.object({
    showInternalCosts: z.boolean().default(true),
    showPriceBookPicker: z.boolean().default(false),
    showCustomerLineItemPrices: z.boolean().default(true),
    paymentProvider: z.enum(["stripe", "manual"]).default("stripe"),
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
});
export type BusinessConfig = z.infer<typeof businessConfigSchema>;
