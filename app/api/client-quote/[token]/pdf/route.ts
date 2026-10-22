import { readFile } from "node:fs/promises";
import path from "node:path";
import { readClientQuoteSource } from "@/lib/client-quote";
import { buildQuotePdf, quotePdfFileName } from "@/lib/quote-pdf";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const source = await readClientQuoteSource(token);
  if (!source) return new Response("Not found", { status: 404 });

  const logo = await readFile(
    path.join(process.cwd(), "public", "images", "logo.png"),
  );
  const pdf = await buildQuotePdf(source.pdfQuote, source.pdfItems, logo);
  const fileName = (
    source.view.acceptance
      ? quotePdfFileName(source.pdfQuote).replace(/\.pdf$/i, " - Signed.pdf")
      : quotePdfFileName(source.pdfQuote)
  ).replace(/["\\]/g, "");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "application/pdf",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
