import type { ScopeItem } from "@/lib/types";

export const DEFAULT_SUB_MULTIPLIER = 1.7;
export const DEFAULT_MATERIAL_MULTIPLIER = 1.1;

export function calculatedQuotePrice(
  item: Pick<ScopeItem, "subCost" | "materialCost">,
  subMultiplier: number,
  materialMultiplier: number,
) {
  return (
    Math.round(
      (item.subCost * subMultiplier +
        (item.materialCost ?? 0) * materialMultiplier) *
        100,
    ) / 100
  );
}

export function validMultiplier(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}
