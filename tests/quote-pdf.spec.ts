import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { buildQuotePdf, quotePdfFileName } from "../lib/quote-pdf";
import type { Quote, ScopeItem } from "../lib/types";

const timestamp = "2026-09-28T14:44:39.000Z";
const quote: Quote = {
  id: "12900000-0000-4000-8000-000000000129",
  createdAt: timestamp,
  updatedAt: timestamp,
  name: "Primary Bath Shower / Bath Remodel",
  address: "1207 Patterson Grove Rd, Apex, NC 27502",
  client: "Jeremey Ulrey",
  clientEmail: "",
  clientPhone: "(602) 628-1323",
  startDate: "",
  endDate: "",
  status: "Sent",
  description: "Primary bath shower / bath remodel",
  category: "Bathroom",
  cover: "",
  quoteNumber: "129",
  customerId: "PLHI-26030",
  revisedDate: "2026-09-28",
  preparedBy: "Matthew Magner",
  preparedByPhone: "(919) 413-9782",
  quoteNotes:
    "This quote includes labor only. Tile installation includes the additional $500.",
};

function scopeItem(index: number): ScopeItem {
  return {
    id: `12900000-0000-4000-8${String(index).padStart(3, "0")}-000000000129`,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: quote.id,
    title: `Scope item ${index + 1}`,
    quantity: 1,
    unit: "job",
    estimate: 1000 + index,
    subCost: 0,
    materialCost: 0,
    contractorId: "",
    status: "To do",
  };
}

test("quote PDF is a valid letter document with stable metadata and filename", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const bytes = await buildQuotePdf(
    quote,
    Array.from({ length: 10 }, (_, index) => scopeItem(index)),
    logo,
  );
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  const document = await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBe(1);
  expect(document.getTitle()).toBe("Premium Remodel - Jeremey Ulrey - Quote");
  expect(document.getSubject()).toBe("PRIMARY BATH SHOWER / BATH REMODEL");
  expect(document.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  expect(quotePdfFileName(quote)).toBe(
    "Premium Remodel - Jeremey Ulrey - Quote 129.pdf",
  );
});

test("long scopes continue onto additional pages", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const bytes = await buildQuotePdf(
    quote,
    Array.from({ length: 28 }, (_, index) => scopeItem(index)),
    logo,
  );
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
});
