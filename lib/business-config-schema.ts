import { z } from "zod";

export const navigationPages = [
  "Overview",
  "Projects",
  "Quotes",
  "Price book",
  "Leads",
  "Door knocking",
  "Upcoming",
  "Contractors",
  "Generate",
  "Team map",
  "Team",
  "Settings",
] as const;

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
    website: z.union([
      z.url().refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS website URL."),
      z.literal(""),
    ]).default(""),
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
    paymentProvider: z.enum(["stripe", "manual"]).default("stripe"),
  }),
  navigation: z
    .array(z.enum(navigationPages))
    .max(navigationPages.length)
    .refine(
      (items) => items.includes("Settings"),
      "Settings must remain in navigation.",
    ),
});
export type BusinessConfig = z.infer<typeof businessConfigSchema>;
