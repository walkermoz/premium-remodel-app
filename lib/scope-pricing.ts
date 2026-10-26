/** Keep stored unit values stable while showing how each item is priced. */
export const pricingBases = [
  { value: "job", label: "Flat price" },
  { value: "sq ft", label: "Per sq ft" },
  { value: "linear ft", label: "Per linear ft" },
  { value: "each", label: "Per item" },
  { value: "hours", label: "Per hour" },
];

export const salePricingBases = pricingBases.map((basis) =>
  basis.value === "job" ? { ...basis, label: "Per job" } : basis,
);

const measuredUnits: Record<string, { quantity: string; rate: string }> = {
  job: { quantity: "jobs", rate: "job" },
  "sq ft": { quantity: "sq ft", rate: "sq ft" },
  "linear ft": { quantity: "linear ft", rate: "linear ft" },
  each: { quantity: "items", rate: "item" },
  hours: { quantity: "hours", rate: "hour" },
};

export function quantityLabel(unit: string) {
  return unit === "job"
    ? "Number of jobs"
    : `Total ${measuredUnits[unit]?.quantity || unit}`;
}

export function rateLabel(unit: string) {
  return `Price per ${measuredUnits[unit]?.rate || unit}`;
}

export function costRateLabel(unit: string) {
  return unit === "job"
    ? "Total cost"
    : `Cost per ${measuredUnits[unit]?.rate || unit}`;
}

/** ScopeItem.estimate remains the full line total throughout the app. */
export function lineTotal(quantity: number, rate: number) {
  return Math.round((quantity * rate + Number.EPSILON) * 100) / 100;
}

/** Older measured rows only stored a total; recover their editable rate. */
export function rateFromTotal(total: number, quantity: number) {
  return quantity > 0 ? Number((total / quantity).toFixed(8)) : 0;
}
