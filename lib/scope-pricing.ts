/** Keep stored unit values stable while showing how each item is priced. */
export const pricingBases = [
  { value: "job", label: "Flat price" },
  { value: "sq ft", label: "Per sq ft" },
  { value: "linear ft", label: "Per linear ft" },
  { value: "each", label: "Per item" },
  { value: "hours", label: "Per hour" },
];

export function rateLabel(unit: string) {
  const basis = pricingBases.find((entry) => entry.value === unit);
  return `Rate ${basis?.label.toLowerCase() || `per ${unit}`}`;
}

/** ScopeItem.estimate remains the full line total throughout the app. */
export function lineTotal(quantity: number, rate: number) {
  return Math.round((quantity * rate + Number.EPSILON) * 100) / 100;
}

/** Older measured rows only stored a total; recover their editable rate. */
export function rateFromTotal(total: number, quantity: number) {
  return quantity > 0 ? Number((total / quantity).toFixed(8)) : 0;
}
