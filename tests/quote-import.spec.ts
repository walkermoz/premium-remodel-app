import { PDFDocument, StandardFonts } from "pdf-lib";
import { test, expect, password } from "./supabase-fixture";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;

async function proposal(room: number, labor: number, material: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "BATHROOM REMODEL PROPOSAL",
    `Sample Client | 100 Test Lane, Raleigh NC`,
    "PREPARED BY PROPOSAL DATE",
    "Test Admin October 14, 2026",
    "TOTAL PROJECT INVESTMENT",
    `$${labor + material}`,
    "PROPOSAL OVERVIEW",
    `Bathroom ${room} remodel with tile and fixtures.`,
    "ESTIMATED CONSTRUCTION DURATION",
    "Approximately two weeks.",
    "INVESTMENT BREAKDOWN",
    "Labor and construction costs Amount",
    `Shower construction $${labor}`,
    `TOTAL LABOR AND CONSTRUCTION COSTS $${labor}`,
    "INCLUDED FINISH-MATERIAL ALLOWANCES",
    "Finish-material allowance Amount",
    `Tile material $${material}`,
    `TOTAL INCLUDED MATERIAL ALLOWANCES $${material}`,
    "PAYMENT SCHEDULE",
    "50% deposit; 50% at completion",
    "OWNER ACCEPTANCE",
  ];
  lines.forEach((line, index) =>
    page.drawText(line, { x: 40, y: 750 - index * 25, size: 11, font }),
  );
  return Buffer.from(await doc.save());
}

cloudTest(
  "imports two PDF proposals as separate priced quotes",
  async ({ company, page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill(company.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Quotes", exact: true }).click();
    await page.getByRole("button", { name: "Import PDFs" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles([
      {
        name: "Sample Bathroom 1.pdf",
        mimeType: "application/pdf",
        buffer: await proposal(1, 200, 100),
      },
      {
        name: "Sample Bathroom 2.pdf",
        mimeType: "application/pdf",
        buffer: await proposal(2, 300, 150),
      },
    ]);
    await expect(dialog.getByText("PDF total $300")).toBeVisible();
    await expect(dialog.getByText("PDF total $450")).toBeVisible();
    await dialog.getByRole("button", { name: "Import 2 quotes" }).click();
    await expect(
      page.getByRole("heading", { name: "Sample Client — Bathroom 1 Remodel" }),
    ).toBeVisible();
    const workspace = await (await page.request.get("/api/workspace")).json();
    const imported = workspace.quotes.filter(
      (quote: { importedFrom?: string }) =>
        quote.importedFrom?.startsWith("Sample Bathroom"),
    );
    expect(imported).toHaveLength(2);
    expect(imported.map((quote: { status: string }) => quote.status)).toEqual([
      "Draft",
      "Draft",
    ]);
    for (const quote of imported) {
      const items = workspace.scope.filter(
        (item: { projectId: string }) => item.projectId === quote.id,
      );
      expect(items).toHaveLength(2);
      expect(
        items.reduce(
          (sum: number, item: { estimate: number }) => sum + item.estimate,
          0,
        ),
      ).toBe(quote.name.includes("Bathroom 1") ? 300 : 450);
      expect(
        items.find((item: { title: string }) => item.title === "Tile material")
          ?.materialCost,
      ).toBe(quote.name.includes("Bathroom 1") ? 100 : 150);
    }
  },
);
