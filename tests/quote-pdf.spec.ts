import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { buildQuotePdf, quotePdfFileName } from "../lib/quote-pdf";
import { UNGROUPED_SCOPE_PROJECT_ID } from "../lib/scope-projects";
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
    position: index,
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
  expect(document.getPageCount()).toBe(2);
  expect(document.getTitle()).toBe("Premium Remodel - Jeremey Ulrey - Quote");
  expect(document.getSubject()).toBe("PRIMARY BATH SHOWER / BATH REMODEL");
  for (const page of document.getPages())
    expect(page.getSize()).toEqual({ width: 612, height: 792 });
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

test("selected before and concept photos are included on a labeled quote page", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#86a6b8" },
  })
    .jpeg()
    .toBuffer();
  const bytes = await buildQuotePdf(quote, [scopeItem(0)], logo, [
    {
      attachmentId: crypto.randomUUID(),
      kind: "before",
      caption: "Existing bath",
      bytes: image,
    },
    {
      attachmentId: crypto.randomUUID(),
      kind: "concept",
      caption: "Warm spa concept",
      bytes: image,
    },
  ]);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: bytes }).promise;
  expect(document.numPages).toBe(2);
  const page = await document.getPage(2);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
  expect(text).toContain("QUOTE PHOTOS");
  expect(text).toContain("BEFORE");
  expect(text).toContain("Existing bath");
  expect(text).toContain("AI CONCEPT - VISUAL EXAMPLE");
  expect(text).toContain("Warm spa concept");
});

test("quote PDF omits placeholder and removed project headings but retains their work items", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const bytes = await buildQuotePdf(
    quote,
    [
      scopeItem(0),
      {
        ...scopeItem(1),
        sectionId: UNGROUPED_SCOPE_PROJECT_ID,
        sectionName: "",
      },
    ],
    logo,
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items
      .filter((item): item is typeof item & { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    expect(text).not.toContain("PROJECT | PROJECT #1");
    expect(text).not.toContain("PROJECT #1");
    expect(text).toContain("Scope item 1");
    expect(text).toContain("Scope item 2");
    expect(text).not.toContain("PROJECT | SCOPE ITEMS");
  } finally {
    await loadingTask.destroy();
  }
});

test("quote PDF shows a custom scope heading without the project prefix", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const bytes = await buildQuotePdf(
    quote,
    [
      {
        ...scopeItem(0),
        sectionId: "kitchen",
        sectionName: "Kitchen phase",
      },
    ],
    logo,
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items
      .filter((item): item is typeof item & { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    expect(text).toContain("KITCHEN PHASE");
    expect(text).not.toContain("PROJECT | KITCHEN PHASE");
  } finally {
    await loadingTask.destroy();
  }
});

test("internal price components count toward the PDF total without appearing as line items", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const bytes = await buildQuotePdf(
    quote,
    [
      scopeItem(0),
      {
        ...scopeItem(1),
        title: "General company overhead",
        estimate: 1700,
        customerVisible: false,
      },
    ],
    logo,
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items
      .filter((item): item is typeof item & { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    expect(text).toContain("$2,700.00");
    expect(text).not.toContain("General company overhead");
  } finally {
    await loadingTask.destroy();
  }
});

test("scope-only quote PDFs omit individual and section price labels", async () => {
  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const bytes = await buildQuotePdf(
    quote,
    [scopeItem(0)],
    logo,
    [],
    undefined,
    { showLineItemPrices: false },
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items
      .filter((item): item is typeof item & { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    expect(text).toContain("TOTAL PROJECT INVESTMENT");
    expect(text).toContain("Scope item 1");
    expect(text).toContain("Notes");
    expect(text).not.toContain("Notes & payment");
    expect(text).not.toContain("LINE TOTAL");
    expect(text).not.toContain("SECTION TOTAL");
  } finally {
    await loadingTask.destroy();
  }
});
