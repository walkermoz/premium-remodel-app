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
  customerVisible: true,
  subUnit: "sq ft",
  subRateCents: 1800,
  materialUnit: "sq ft",
  materialRateCents: 200,
  contractorRates: [
    { contractorId: "c5", rateCents: 1800 },
    { contractorId: "c6", rateCents: 2000 },
  ],
};

const overheadId = "f342d00a-ae0b-41d2-83cb-d84c55c3caf7";
export const demoOverheadPricebookItem: PricebookItem = {
  id: overheadId,
  code: pricebookCode(overheadId),
  revision: 1,
  active: true,
  name: "General company overhead",
  description: "General company overhead allocated by project duration.",
  category: "Overhead",
  unit: "days",
  customerRateCents: 170000,
  customerVisible: false,
  subUnit: "days",
  subRateCents: 0,
  materialUnit: "days",
  materialRateCents: 0,
  contractorRates: [],
};

const demoPricebookKey = "premium-remodel-demo-pricebook-v2";
const previousDemoPricebookKey = "premium-remodel-demo-pricebook-v1";

export function readDemoPricebook(): PricebookItem[] {
  try {
    const saved =
      localStorage.getItem(demoPricebookKey) ||
      localStorage.getItem(previousDemoPricebookKey);
    if (saved) {
      const items: unknown = JSON.parse(saved);
      if (Array.isArray(items)) {
        const migrated = (items as PricebookItem[]).map((item) => ({
          ...item,
          customerVisible: item.customerVisible !== false,
        }));
        if (!migrated.some((item) => item.id === overheadId))
          migrated.push(demoOverheadPricebookItem);
        writeDemoPricebook(migrated);
        return migrated;
      }
    }
  } catch {
    // A damaged sample cache should not prevent the demo from loading.
  }
  return [demoTilePricebookItem, demoOverheadPricebookItem];
}

export function writeDemoPricebook(items: PricebookItem[]) {
  localStorage.setItem(demoPricebookKey, JSON.stringify(items));
}
