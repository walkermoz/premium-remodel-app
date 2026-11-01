import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildQuotePdf } from "../lib/quote-pdf";
import { resolveQuotePriceDisplay } from "../lib/quote-price-display";
import type { Quote, ScopeItem } from "../lib/types";

const quote: Quote = {
  id: "abc00000-0000-4000-8000-000000000001",
  createdAt: "2026-10-31T12:00:00.000Z",
  updatedAt: "2026-10-31T12:00:00.000Z",
  name: "Bathroom",
  client: "Test Client",
  address: "1 Test Lane",
  startDate: "",
  endDate: "",
  status: "Draft",
  description: "",
  category: "Bathroom",
  cover: "",
};
const item: ScopeItem = {
  id: "abc00000-0000-4000-8000-000000000002",
  createdAt: quote.createdAt,
  updatedAt: quote.updatedAt,
  projectId: quote.id,
  sectionId: "abc00000-0000-4000-8000-000000000003",
  sectionName: "Shower",
  title: "Waterproofing",
  quantity: 1,
  unit: "job",
  estimate: 850,
  subCost: 300,
  materialCost: 100,
  contractorId: "",
  status: "To do",
};
const business = {
  name: "Test Service Company",
  website: "https://example.test",
  phone: "(555) 010-1000",
};

async function pdfText(mode: Quote["priceDisplay"]) {
  const bytes = await buildQuotePdf(
    { ...quote, priceDisplay: mode },
    [item],
    null,
    [],
    business,
    { showLineItemPrices: true },
  );
  const document = await getDocument({ data: bytes }).promise;
  const page = await document.getPage(1);
  return (await page.getTextContent()).items
    .map((entry) => ("str" in entry ? entry.str : ""))
    .join(" ");
}

test("per-quote pricing choice overrides the organization default", () => {
  expect(resolveQuotePriceDisplay({}, true)).toBe("itemized");
  expect(resolveQuotePriceDisplay({}, false)).toBe("total");
  expect(resolveQuotePriceDisplay({ priceDisplay: "project" }, true)).toBe(
    "project",
  );
});

test("customer PDF offers item prices, project subtotals, or total only", async () => {
  const itemized = await pdfText("itemized");
  const project = await pdfText("project");
  const total = await pdfText("total");
  for (const text of [itemized, project, total]) {
    expect(text).toContain("Waterproofing");
    expect(text).toContain("$850.00");
  }
  expect(itemized).toContain("LINE TOTAL");
  expect(project).not.toContain("LINE TOTAL");
  expect(project).toContain("SECTION TOTAL");
  expect(total).not.toContain("SECTION TOTAL");
});
