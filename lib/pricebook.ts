import { z } from "zod";

export const pricebookUnit = z.enum([
  "job",
  "sq ft",
  "linear ft",
  "each",
  "hours",
]);
export const pricebookInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  category: z.string().trim().max(100).default(""),
  unit: pricebookUnit,
  customerRateCents: z.number().int().min(0).max(100_000_000),
  subUnit: pricebookUnit,
  subRateCents: z.number().int().min(0).max(100_000_000),
  materialUnit: pricebookUnit,
  materialRateCents: z.number().int().min(0).max(100_000_000),
});

export type PricebookItem = z.infer<typeof pricebookInput> & {
  id: string;
  revision: number;
  active: boolean;
};

export function mapPricebookItem(row: Record<string, unknown>): PricebookItem {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ""),
    category: String(row.category || ""),
    unit: pricebookUnit.parse(row.unit),
    customerRateCents: Number(row.customer_rate_cents),
    subUnit: pricebookUnit.parse(row.sub_unit),
    subRateCents: Number(row.sub_rate_cents),
    materialUnit: pricebookUnit.parse(row.material_unit),
    materialRateCents: Number(row.material_rate_cents),
    revision: Number(row.revision),
    active: row.active === true,
  };
}

export function pricebookScopeValues(item: PricebookItem, quantity = 1) {
  const subQuantity = item.subUnit === item.unit ? quantity : 1;
  const materialQuantity = item.materialUnit === item.unit ? quantity : 1;
  return {
    title: item.name,
    details: item.description,
    quantity,
    unit: item.unit,
    estimate: Math.round(item.customerRateCents * quantity) / 100,
    subCost: Math.round(item.subRateCents * subQuantity) / 100,
    subCostUnit: item.subUnit,
    subCostQuantity: subQuantity,
    materialCost: Math.round(item.materialRateCents * materialQuantity) / 100,
    materialCostUnit: item.materialUnit,
    materialCostQuantity: materialQuantity,
    pricebookItemId: item.id,
    pricebookRevision: item.revision,
  };
}
