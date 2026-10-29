import { pricebookCode, type PricebookItem } from "./pricebook";

const tileId = "e1a5d7b4-3e20-4cc3-9f58-e8a13148bb02";
export const demoTilePricebookItem: PricebookItem = {
  id: tileId,
  code: pricebookCode(tileId),
  revision: 1,
  active: true,
  name: "Tile installation",
  description: "Install tile and grout over the prepared surface.",
  category: "Tile",
  unit: "sq ft",
  customerRateCents: 2800,
  subUnit: "sq ft",
  subRateCents: 1800,
  materialUnit: "sq ft",
  materialRateCents: 200,
  contractorRates: [
    { contractorId: "c5", rateCents: 1800 },
    { contractorId: "c6", rateCents: 2000 },
  ],
};

const demoPricebookKey = "premium-remodel-demo-pricebook-v1";

export function readDemoPricebook(): PricebookItem[] {
  try {
    const saved = localStorage.getItem(demoPricebookKey);
    if (saved) {
      const items: unknown = JSON.parse(saved);
      if (Array.isArray(items)) return items as PricebookItem[];
    }
  } catch {
    // A damaged sample cache should not prevent the demo from loading.
  }
  return [demoTilePricebookItem];
}

export function writeDemoPricebook(items: PricebookItem[]) {
  localStorage.setItem(demoPricebookKey, JSON.stringify(items));
}
