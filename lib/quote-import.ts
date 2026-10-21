import { z } from "zod";

export const importedQuoteSchema = z.object({
  fileName: z.string().max(250),
  name: z.string().trim().min(1).max(250),
  client: z.string().trim().max(250),
  address: z.string().trim().max(250),
  preparedBy: z.string().trim().max(250).default(""),
  category: z
    .enum(["Kitchen", "Bathroom", "Basement", "Outdoor", "Whole home", "Other"])
    .default("Other"),
  description: z.string().trim().max(15000),
  quoteNotes: z.string().trim().max(15000),
  expectedTotal: z.number().finite().min(0).max(1_000_000_000),
  rows: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(250),
        amount: z.number().finite().min(0).max(1_000_000_000),
        sectionName: z.string().trim().min(1).max(250),
      }),
    )
    .min(1)
    .max(100),
});
export type ImportedQuote = z.infer<typeof importedQuoteSchema>;

function dollars(value: string) {
  return Number(value.replace(/[$,]/g, ""));
}

/** Parse the priced rows as printed, without asking a model to guess prices. */
export function parseInvestmentBreakdown(
  pages: string[],
  fileName: string,
): ImportedQuote {
  const text = pages.join("\n");
  const match = text.match(
    /INVESTMENT BREAKDOWN\s*\n([\s\S]*?)(?:\nPAYMENT SCHEDULE|\nOWNER ACCEPTANCE|$)/i,
  );
  if (!match)
    throw new Error(
      "No investment breakdown was found. Use a proposal with selectable text and priced rows.",
    );

  const rows: ImportedQuote["rows"] = [];
  let sectionName = "Labor and construction costs";
  let expectedLabor: number | null = null;
  let expectedMaterials: number | null = null;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (
      /^(INCLUDED FINISH-MATERIAL ALLOWANCES|Finish-material allowance)/i.test(
        line,
      )
    ) {
      sectionName = "Included finish-material allowances";
      continue;
    }
    if (/^TOTAL LABOR AND CONSTRUCTION COSTS\b/i.test(line)) {
      const amount = line.match(/\$[\d,]+(?:\.\d{2})?\s*$/);
      if (amount) expectedLabor = dollars(amount[0]);
      continue;
    }
    if (/^TOTAL INCLUDED MATERIAL ALLOWANCES\b/i.test(line)) {
      const amount = line.match(/\$[\d,]+(?:\.\d{2})?\s*$/);
      if (amount) expectedMaterials = dollars(amount[0]);
      continue;
    }
    if (
      /^(Labor and construction costs|Amount|INVESTMENT BREAKDOWN|INCLUDED FINISH-MATERIAL ALLOWANCES)\b/i.test(
        line,
      )
    )
      continue;
    const priced = line.match(/^(.*?)\s+\$([\d,]+(?:\.\d{2})?)\s*$/);
    if (priced?.[1])
      rows.push({
        title: priced[1].trim(),
        amount: dollars(priced[2]),
        sectionName,
      });
  }
  if (!rows.length)
    throw new Error("No priced rows were found in the investment breakdown.");
  const labor = rows
    .filter((row) => row.sectionName === "Labor and construction costs")
    .reduce((sum, row) => sum + row.amount, 0);
  const materials = rows
    .filter((row) => row.sectionName === "Included finish-material allowances")
    .reduce((sum, row) => sum + row.amount, 0);
  if (
    (expectedLabor !== null && labor !== expectedLabor) ||
    (expectedMaterials !== null && materials !== expectedMaterials)
  )
    throw new Error(
      "The priced rows do not match a section total. Check the PDF before importing.",
    );
  const summary =
    pages.find((page) => /TOTAL PROJECT INVESTMENT/i.test(page)) || "";
  const expectedTotal =
    Number(
      summary
        .match(/TOTAL PROJECT INVESTMENT\s*\n\s*\$([\d,]+)/i)?.[1]
        ?.replace(/,/g, ""),
    ) || labor + materials;
  if (labor + materials !== expectedTotal)
    throw new Error(
      "The priced rows do not match the proposal total. Check the PDF before importing.",
    );

  const clientAddress = text.match(
    /^([^\n|]{2,100})\s*\|\s*((?=\d)[^\n|]{5,150})$/m,
  );
  const client = clientAddress?.[1].trim() || "";
  const address = clientAddress?.[2].trim() || "";
  const bathroom =
    fileName.match(/Bathroom[ _-]*(\d+)/i)?.[1] ||
    text.match(/BATHROOM\s+(\d+)\s*\|/i)?.[1] ||
    "";
  const category = /bathroom|\bbath\b/i.test(
    `${fileName} ${text.slice(0, 400)}`,
  )
    ? "Bathroom"
    : /kitchen/i.test(`${fileName} ${text.slice(0, 400)}`)
      ? "Kitchen"
      : /basement/i.test(`${fileName} ${text.slice(0, 400)}`)
        ? "Basement"
        : /deck|patio|garage|outdoor/i.test(`${fileName} ${text.slice(0, 400)}`)
          ? "Outdoor"
          : /whole[ -]?home/i.test(`${fileName} ${text.slice(0, 400)}`)
            ? "Whole home"
            : "Other";
  const overview =
    summary
      .match(
        /PROPOSAL OVERVIEW\s*\n([\s\S]*?)(?:\nPricing assumptions|\nPricing assumes|\nESTIMATED CONSTRUCTION DURATION)/i,
      )?.[1]
      ?.trim() || "";
  const payment =
    text
      .match(
        /PAYMENT SCHEDULE\s*\n([\s\S]*?)(?:\nAllowance selections|\nOWNER ACCEPTANCE)/i,
      )?.[1]
      ?.trim() || "";
  return importedQuoteSchema.parse({
    fileName,
    name: `${client || "Imported"} — ${category === "Bathroom" ? `Bathroom${bathroom ? ` ${bathroom}` : ""} Remodel` : category === "Other" ? "Imported Quote" : `${category} Remodel`}`,
    client,
    address,
    category,
    preparedBy:
      summary
        .match(
          /PREPARED BY PROPOSAL DATE\s*\n([^\n]+?)\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}/i,
        )?.[1]
        ?.trim() || "",
    description: overview,
    quoteNotes: payment ? `Original proposal payment schedule: ${payment}` : "",
    expectedTotal,
    rows,
  });
}
