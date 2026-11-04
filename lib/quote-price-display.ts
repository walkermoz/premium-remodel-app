import type { QuotePriceDisplay } from "./types";

export const quotePriceDisplayOptions: Array<{
  value: QuotePriceDisplay;
  label: string;
  description: string;
}> = [
  {
    value: "itemized",
    label: "Itemized prices",
    description: "Show each work item with its price.",
  },
  {
    value: "total",
    label: "Total only",
    description: "Show the scope of work and the total quote price.",
  },
];

export function resolveQuotePriceDisplay(
  quote: { priceDisplay?: QuotePriceDisplay },
  defaultItemized: boolean,
): QuotePriceDisplay {
  // Older quotes may still contain the removed project-subtotal mode. Treat
  // those as total-only so legacy data remains readable without resurfacing
  // the retired customer-facing option.
  if (quote.priceDisplay === "project") return "total";
  return quote.priceDisplay || (defaultItemized ? "itemized" : "total");
}
