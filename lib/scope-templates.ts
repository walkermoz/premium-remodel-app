export interface ScopeTemplateRow {
  id: string;
  title: string;
  unit: "job" | "sq ft";
}

export interface ScopeTemplate {
  id: string;
  name: string;
  description: string;
  rows: ScopeTemplateRow[];
}

/**
 * Standard bathroom proposal rows based on Premium Remodel's bathroom
 * questionnaire. Prices and costs intentionally start at zero so the template
 * never invents an allowance or price for a customer.
 */
export const bathroomScopeTemplate: ScopeTemplate = {
  id: "bathroom",
  name: "Bathroom",
  description:
    "Start with the standard bathroom work areas, then price and edit each row in the quote.",
  rows: [
    {
      id: "demolition",
      title: "Demolition & site protection",
      unit: "job",
    },
    {
      id: "divider-wall",
      title: "Divider wall removal & wall repairs",
      unit: "job",
    },
    {
      id: "framing",
      title: "Framing & preparation",
      unit: "job",
    },
    {
      id: "plumbing",
      title: "Plumbing adjustments",
      unit: "job",
    },
    {
      id: "electrical",
      title: "Electrical adjustments",
      unit: "job",
    },
    {
      id: "waterproofing",
      title: "Shower base & waterproofing",
      unit: "job",
    },
    {
      id: "shower-tile",
      title: "Shower wall tile installation",
      unit: "sq ft",
    },
    {
      id: "shower-features",
      title: "Shower niche, bench & accessories",
      unit: "job",
    },
    {
      id: "shower-fixtures",
      title: "Shower fixtures & trim",
      unit: "job",
    },
    {
      id: "glass",
      title: "Custom glass shower enclosure",
      unit: "job",
    },
    {
      id: "vanity",
      title: "Vanity, countertop & sink",
      unit: "job",
    },
    {
      id: "toilet",
      title: "Toilet installation",
      unit: "job",
    },
    {
      id: "floor-tile",
      title: "Bathroom floor tile",
      unit: "sq ft",
    },
    {
      id: "mirror-light-fan",
      title: "Mirror, vanity light & exhaust fan",
      unit: "job",
    },
    {
      id: "paint-finish",
      title: "Paint, finish carpentry & final cleanup",
      unit: "job",
    },
    {
      id: "allowances",
      title: "Tile & fixture material allowance",
      unit: "job",
    },
  ],
};
