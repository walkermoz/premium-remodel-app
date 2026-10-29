import { z } from "zod";

export const pricebookUnit = z.enum([
  "job",
  "sq ft",
  "linear ft",
  "each",
  "hours",
  "days",
]);
export const contractorPricebookRate = z.object({
  contractorId: z.uuid(),
  rateCents: z.number().int().min(0).max(100_000_000),
});
export type ContractorPricebookRate = z.infer<typeof contractorPricebookRate>;
export const pricebookInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).default(""),
    category: z.string().trim().max(100).default(""),
    unit: pricebookUnit,
    customerRateCents: z.number().int().min(0).max(100_000_000),
    customerVisible: z.boolean().default(true),
    subUnit: pricebookUnit,
    subRateCents: z.number().int().min(0).max(100_000_000),
    materialUnit: pricebookUnit,
    materialRateCents: z.number().int().min(0).max(100_000_000),
    contractorRates: z.array(contractorPricebookRate).max(50).optional(),
  })
  .refine(
    (item) =>
      new Set(item.contractorRates?.map((rate) => rate.contractorId)).size ===
      (item.contractorRates?.length || 0),
    { path: ["contractorRates"], message: "Choose each contractor only once." },
  );

export type PricebookItem = Omit<
  z.infer<typeof pricebookInput>,
  "contractorRates"
> & {
  id: string;
  code: string;
  revision: number;
  active: boolean;
  contractorRates: ContractorPricebookRate[];
};

/** Stable, automatically assigned reference. No per-organization counter to race or leak. */
export function pricebookCode(id: string) {
  return `PB-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function pricebookMatches(item: PricebookItem, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return (
    !needle ||
    [item.name, item.code, item.category, item.description].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    )
  );
}

export function mapPricebookItem(row: Record<string, unknown>): PricebookItem {
  return {
    id: String(row.id),
    code: pricebookCode(String(row.id)),
    name: String(row.name),
    description: String(row.description || ""),
    category: String(row.category || ""),
    unit: pricebookUnit.parse(row.unit),
    customerRateCents: Number(row.customer_rate_cents),
    customerVisible: row.customer_visible !== false,
    subUnit: pricebookUnit.parse(row.sub_unit),
    subRateCents: Number(row.sub_rate_cents),
    materialUnit: pricebookUnit.parse(row.material_unit),
    materialRateCents: Number(row.material_rate_cents),
    contractorRates: z
      .array(contractorPricebookRate)
      .parse(row.contractor_rates || []),
    revision: Number(row.revision),
    active: row.active === true,
  };
}

export function pricebookScopeValues(
  item: PricebookItem,
  quantity = 1,
  contractorId = "",
) {
  const selectedRate = item.contractorRates.find(
    (rate) => rate.contractorId === contractorId,
  );
  if (item.contractorRates.length && !selectedRate)
    throw new Error("Choose a contractor for this price-book item.");
  const subQuantity = item.subUnit === item.unit ? quantity : 1;
  const materialQuantity = item.materialUnit === item.unit ? quantity : 1;
  return {
    title: item.name,
    details: item.description,
    quantity,
    unit: item.unit,
    estimate: Math.round(item.customerRateCents * quantity) / 100,
    subCost:
      Math.round((selectedRate?.rateCents ?? item.subRateCents) * subQuantity) /
      100,
    subCostUnit: item.subUnit,
    subCostQuantity: subQuantity,
    materialCost: Math.round(item.materialRateCents * materialQuantity) / 100,
    materialCostUnit: item.materialUnit,
    materialCostQuantity: materialQuantity,
    pricebookItemId: item.id,
    pricebookRevision: item.revision,
    customerVisible: item.customerVisible,
    ...(selectedRate ? { contractorId: selectedRate.contractorId } : {}),
  };
}
