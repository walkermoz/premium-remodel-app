import { expect, test } from "@playwright/test";
import {
  pricebookCode,
  pricebookMatches,
  pricebookScopeValues,
  type PricebookItem,
} from "../lib/pricebook";
import { schemas } from "../lib/schemas";

const item: PricebookItem = {
  id: "c64abf34-46e8-49c7-a3f1-0fa642e7b6de",
  code: "PB-C64ABF3446E8",
  revision: 2,
  active: true,
  name: "Tile installation",
  description: "Install floor tile and grout.",
  category: "Bathrooms",
  unit: "sq ft",
  customerRateCents: 25000,
  subUnit: "sq ft",
  subRateCents: 10000,
  materialUnit: "job",
  materialRateCents: 50000,
  contractorRates: [],
};

test("price-book codes are stable and catalog search includes them", () => {
  expect(pricebookCode(item.id)).toBe(item.code);
  expect(pricebookMatches(item, "c64abf")).toBe(true);
  expect(pricebookMatches(item, "floor tile")).toBe(true);
  expect(pricebookMatches(item, "kitchen")).toBe(false);
});

test("a quote copies independent price and cost bases without following later catalog edits", () => {
  const quoteLine = pricebookScopeValues(item, 250);
  expect(quoteLine).toMatchObject({
    quantity: 250,
    unit: "sq ft",
    estimate: 62500,
    subCost: 25000,
    subCostUnit: "sq ft",
    subCostQuantity: 250,
    materialCost: 500,
    materialCostUnit: "job",
    materialCostQuantity: 1,
    pricebookItemId: item.id,
    pricebookRevision: 2,
  });
  expect(
    schemas.scope.parse({
      projectId: "quote-1",
      ...quoteLine,
      contractorId: "",
      status: "To do",
    }),
  ).toMatchObject(quoteLine);
  item.customerRateCents = 26000;
  expect(quoteLine.estimate).toBe(62500);
});

test("a tile item asks for a contractor and snapshots the selected per-square-foot rate", () => {
  const tile: PricebookItem = {
    ...item,
    customerRateCents: 2800,
    subRateCents: 1800,
    materialUnit: "sq ft",
    materialRateCents: 200,
    contractorRates: [
      { contractorId: "81adcd34-1630-4f3e-90d3-c2e22ee9ae0a", rateCents: 1800 },
      { contractorId: "84d09fa3-4c66-4a86-a6ca-9db8f3926f94", rateCents: 2000 },
    ],
  };
  expect(() => pricebookScopeValues(tile, 250)).toThrow("Choose a contractor");
  const first = pricebookScopeValues(
    tile,
    250,
    tile.contractorRates[0].contractorId,
  );
  const second = pricebookScopeValues(
    tile,
    250,
    tile.contractorRates[1].contractorId,
  );
  expect(first).toMatchObject({
    estimate: 7000,
    subCost: 4500,
    materialCost: 500,
    contractorId: tile.contractorRates[0].contractorId,
  });
  expect(second).toMatchObject({
    estimate: 7000,
    subCost: 5000,
    materialCost: 500,
    contractorId: tile.contractorRates[1].contractorId,
  });
  expect(first.estimate - first.subCost - first.materialCost).toBe(2000);
  expect(second.estimate - second.subCost - second.materialCost).toBe(1500);
});
