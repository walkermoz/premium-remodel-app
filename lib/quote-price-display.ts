import type { QuotePriceDisplay } from "./types";

export const quotePriceDisplayOptions: Array<{
  value: QuotePriceDisplay;
  label: string;
  description: string;
}> = [
  {
    value: "itemized",
    label: "Itemized prices",
    description: "Show each work item and its price, plus project subtotals.",
  },
  {
    value: "project",
    label: "Project subtotals",
    description: "Show the work items and a price for each project.",
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
  return quote.priceDisplay || (defaultItemized ? "itemized" : "total");
}
