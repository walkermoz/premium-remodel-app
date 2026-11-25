import { z } from "zod";

export const paperworkConfigurationSchema = z.object({
  enabled: z.boolean().default(false),
  contexts: z
    .array(z.enum(["quote", "project", "customer"]))
    .default(["quote"]),
  audience: z.enum(["customer", "staff"]).default("customer"),
  completion: z.enum(["signature", "form", "view"]).default("signature"),
  inPerson: z.boolean().default(true),
  portal: z.boolean().default(true),
  email: z.boolean().default(false),
  autoAttach: z
    .enum(["never", "quote_accepted", "project_created"])
    .default("never"),
});
export type PaperworkConfiguration = z.infer<
  typeof paperworkConfigurationSchema
>;
export const paperworkVariables = [
  ["contact.name", "Customer name"],
  ["contact.email", "Customer email"],
  ["contact.phone", "Customer phone"],
  ["quote.address", "Property address"],
  ["quote.name", "Quote title"],
  ["quote.number", "Quote number"],
  ["quote.total", "Quote total"],
  ["quote.scope", "Customer scope of work"],
  ["organization.name", "Business name"],
  ["organization.legalName", "Business legal name"],
  ["organization.email", "Business email"],
  ["organization.phone", "Business phone"],
  ["staff.name", "Staff name"],
  ["staff.email", "Staff email"],
] as const;
export function resolvePaperworkVariable(
  snapshot: Record<string, unknown>,
  key: string,
  fieldType?: string,
): unknown {
  if (!paperworkVariables.some(([candidate]) => candidate === key))
    return undefined;
  const value = key
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object" && Object.hasOwn(value, part)
          ? (value as Record<string, unknown>)[part]
          : undefined,
      snapshot,
    );
  return key === "quote.total" &&
    typeof value === "number" &&
    ["text", "multiline_text"].includes(fieldType || "")
    ? formatPaperworkCurrency(value, snapshot)
    : value;
}
export function interpolatePaperwork(
  text: string,
  snapshot: Record<string, unknown>,
) {
  return text.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, key: string) => {
    const value = resolvePaperworkVariable(snapshot, key);
    if (value === undefined || value === null || value === "")
      throw new Error(`Missing document variable: ${key}.`);
    return key === "quote.total" && typeof value === "number"
      ? formatPaperworkCurrency(value, snapshot)
      : String(value);
  });
}

export function formatPaperworkCurrency(
  value: number,
  snapshot: Record<string, unknown>,
) {
  const regional = snapshot.regional as
    { locale?: string; currency?: string } | undefined;
  return new Intl.NumberFormat(regional?.locale || "en-US", {
    style: "currency",
    currency: regional?.currency || "USD",
  }).format(value);
}
