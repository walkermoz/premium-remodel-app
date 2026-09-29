import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Quote, ScopeItem } from "./types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 44;
const RIGHT = 568;
const CONTENT_WIDTH = RIGHT - LEFT;

const colors = {
  blue: rgb(0.18, 0.53, 0.78),
  navy: rgb(0.19, 0.21, 0.24),
  muted: rgb(0.42, 0.48, 0.56),
  pale: rgb(0.92, 0.95, 0.96),
  stripe: rgb(0.97, 0.98, 0.98),
  line: rgb(0.72, 0.8, 0.85),
  white: rgb(1, 1, 1),
};

const changeOrderTerms =
  "Work outside the defined scope must be approved in writing before execution, with cost and schedule impacts documented.";
const paymentTerms =
  "This quote is an estimate of the services described above, not an invoice. Payment will be collected prior to provision of services.";

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "");
}

function drawTop(
  page: PDFPage,
  text: string,
  x: number,
  top: number,
  font: PDFFont,
  size: number,
  color = colors.navy,
) {
  page.drawText(safeText(text), {
    x,
    y: PAGE_HEIGHT - top - size,
    font,
    size,
    color,
  });
}

function drawRight(
  page: PDFPage,
  text: string,
  right: number,
  top: number,
  font: PDFFont,
  size: number,
  color = colors.navy,
) {
  const normalized = safeText(text);
  drawTop(
    page,
    normalized,
    right - font.widthOfTextAtSize(normalized, size),
    top,
    font,
    size,
    color,
  );
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of safeText(text).split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawParagraph(
  page: PDFPage,
  text: string,
  top: number,
  font: PDFFont,
  size = 8.4,
  lineHeight = 12,
  maxWidth = CONTENT_WIDTH,
) {
  const lines = wrap(text, font, size, maxWidth);
  lines.forEach((line, index) =>
    drawTop(page, line, LEFT, top + index * lineHeight, font, size),
  );
  return top + lines.length * lineHeight;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function displayDate(value: string | undefined, fallback: string) {
  const raw = value || fallback.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return safeText(raw);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function addressLines(address: string) {
  const pieces = safeText(address)
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length <= 1) return [safeText(address)];
  return [pieces[0], pieces.slice(1).join(", ")];
}

function fitSize(
  text: string,
  font: PDFFont,
  preferred: number,
  width: number,
) {
  let size = preferred;
  while (size > 11 && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

function drawFooter(
  page: PDFPage,
  regular: PDFFont,
  quote: Quote,
  pageNumber: number,
  pageCount: number,
) {
  page.drawLine({
    start: { x: 42, y: 44 },
    end: { x: 570, y: 44 },
    thickness: 0.45,
    color: colors.line,
  });
  const contact = [
    "premiumremodel.com",
    quote.preparedBy || "Premium Remodel",
    quote.preparedByPhone || "(919) 413-9782",
  ]
    .filter(Boolean)
    .join("  |  ");
  drawTop(page, contact, 42, 756, regular, 7, colors.muted);
  drawRight(
    page,
    `Page ${pageNumber}${pageCount > 1 ? ` of ${pageCount}` : ""}`,
    570,
    756,
    regular,
    7,
    colors.muted,
  );
}

function drawTableHeader(page: PDFPage, bold: PDFFont, top: number) {
  page.drawRectangle({
    x: LEFT,
    y: PAGE_HEIGHT - top - 23,
    width: CONTENT_WIDTH,
    height: 23,
    color: colors.pale,
  });
  drawTop(page, "SCOPE OF WORK", 54, top + 5, bold, 8);
  drawRight(page, "LINE TOTAL", 558, top + 5, bold, 8);
}

export async function buildQuotePdf(
  quote: Quote,
  scope: ScopeItem[],
  logoBytes: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(logoBytes);
  const items = scope
    .filter((item) => item.projectId === quote.id)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.position !== undefined && b.item.position !== undefined)
        return a.item.position - b.item.position || a.index - b.index;
      if (a.item.position !== undefined) return -1;
      if (b.item.position !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
  const total = items.reduce((sum, item) => sum + item.estimate, 0);

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);

  page.drawText("PREMIUM REMODEL  |  REMODEL QUOTE", {
    x: 414,
    y: PAGE_HEIGHT - 26.6,
    font: bold,
    size: 6.8,
    color: colors.muted,
  });
  page.drawImage(logo, { x: 176, y: 685, width: 261, height: 74 });

  const heading = safeText(quote.name).toUpperCase();
  const headingSize = fitSize(heading, bold, 17, CONTENT_WIDTH);
  drawTop(page, heading, LEFT, 117, bold, headingSize);
  const meta = [
    `Quote #${quote.quoteNumber || quote.id.slice(0, 8).toUpperCase()}`,
    quote.customerId ? `Customer ID: ${quote.customerId}` : "",
    `Revised ${displayDate(quote.revisedDate, quote.updatedAt)}`,
  ]
    .filter(Boolean)
    .join("  |  ");
  drawTop(page, meta, LEFT, 142, regular, 8.2, colors.muted);

  page.drawRectangle({
    x: LEFT,
    y: PAGE_HEIGHT - 241,
    width: CONTENT_WIDTH,
    height: 77,
    color: colors.pale,
    borderColor: colors.line,
    borderWidth: 0.45,
  });
  page.drawLine({
    start: { x: 306, y: PAGE_HEIGHT - 241 },
    end: { x: 306, y: PAGE_HEIGHT - 164 },
    thickness: 0.45,
    color: colors.line,
  });
  drawTop(page, "PREPARED FOR", 54, 173.5, regular, 7, colors.muted);
  drawTop(page, quote.client || "Client", 54, 187, regular, 10);
  if (quote.clientPhone)
    drawTop(page, quote.clientPhone, 54, 204, regular, 8.5);
  drawTop(
    page,
    `Prepared by ${quote.preparedBy || "Premium Remodel"}`,
    54,
    225.5,
    regular,
    8,
    colors.muted,
  );
  drawTop(page, "PROJECT ADDRESS", 318, 173.5, regular, 7, colors.muted);
  addressLines(quote.address)
    .slice(0, 2)
    .forEach((line, index) =>
      drawTop(page, line, 318, 188 + index * 15, regular, 9),
    );

  page.drawRectangle({
    x: LEFT,
    y: PAGE_HEIGHT - 287,
    width: CONTENT_WIDTH,
    height: 33,
    color: colors.blue,
  });
  drawTop(page, "TOTAL PROJECT INVESTMENT", 54, 267, bold, 9.5, colors.white);
  drawRight(page, money(total), 558, 263, bold, 17, colors.white);

  let tableTop = 301;
  drawTableHeader(page, bold, tableTop);
  let rowTop = tableTop + 23;
  const rowHeight = 22;
  const rowBottomLimit = 572;
  let itemIndex = 0;

  while (itemIndex < items.length) {
    if (rowTop + rowHeight > rowBottomLimit) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawTop(page, `${heading} - SCOPE CONTINUED`, LEFT, 44, bold, 13);
      drawTop(page, meta, LEFT, 65, regular, 7.5, colors.muted);
      tableTop = 92;
      drawTableHeader(page, bold, tableTop);
      rowTop = tableTop + 23;
    }
    const item = items[itemIndex];
    if (itemIndex % 2 === 1)
      page.drawRectangle({
        x: LEFT,
        y: PAGE_HEIGHT - rowTop - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: colors.stripe,
      });
    drawTop(page, item.title, 54, rowTop + 6, regular, 9);
    drawRight(page, money(item.estimate), 558, rowTop + 6, regular, 9);
    page.drawLine({
      start: { x: LEFT, y: PAGE_HEIGHT - rowTop - rowHeight },
      end: { x: RIGHT, y: PAGE_HEIGHT - rowTop - rowHeight },
      thickness: 0.35,
      color: colors.line,
    });
    rowTop += rowHeight;
    itemIndex++;
  }

  if (page !== pages[0] || rowTop + 27 > rowBottomLimit) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawTop(page, `${heading} - TOTAL`, LEFT, 44, bold, 13);
    rowTop = 92;
  }
  page.drawRectangle({
    x: LEFT,
    y: PAGE_HEIGHT - rowTop - 27,
    width: CONTENT_WIDTH,
    height: 27,
    color: colors.pale,
  });
  drawTop(page, "TOTAL PROJECT INVESTMENT", 54, rowTop + 8, bold, 9.5);
  drawRight(page, money(total), 558, rowTop + 6, bold, 12.5);

  let notesTop = rowTop + 37;
  if (notesTop > 600) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    notesTop = 54;
  }
  drawTop(page, "Notes & payment", LEFT, notesTop, bold, 11.5, colors.blue);
  let cursor = notesTop + 22;
  if (quote.quoteNotes) {
    cursor = drawParagraph(page, quote.quoteNotes, cursor, regular);
    cursor += 6;
  }
  cursor = drawParagraph(page, changeOrderTerms, cursor, regular);
  cursor += 12;
  cursor = drawParagraph(page, paymentTerms, cursor, regular, 8.4, 12, 450);
  cursor += 12;
  drawTop(page, "CUSTOMER ACCEPTANCE", LEFT, cursor, bold, 7, colors.muted);
  cursor += 18;
  drawTop(
    page,
    "Signature: __________________________",
    LEFT,
    cursor,
    regular,
    8,
  );
  drawTop(page, "Print name: ______________________", 280, cursor, regular, 8);
  cursor += 19;
  drawTop(page, "Date: _______________", LEFT, cursor, regular, 8);

  pages.forEach((current, index) =>
    drawFooter(current, regular, quote, index + 1, pages.length),
  );

  pdf.setTitle(`Premium Remodel - ${quote.client || quote.name} - Quote`);
  pdf.setAuthor("Premium Remodel");
  pdf.setSubject(heading);
  pdf.setCreator("Premium Remodel");
  pdf.setProducer("Premium Remodel");
  return pdf.save({ useObjectStreams: false });
}

export function quotePdfFileName(quote: Quote) {
  const client = safeText(quote.client || quote.name)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  const number = safeText(quote.quoteNumber || quote.id.slice(0, 8))
    .replace(/[^a-zA-Z0-9-]+/g, "")
    .trim();
  return `Premium Remodel - ${client || "Client"} - Quote ${number || "Draft"}.pdf`;
}
