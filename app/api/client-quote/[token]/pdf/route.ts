import { getBusinessLogoBytes } from "@/lib/business-logo";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { readClientQuoteSource } from "@/lib/client-quote";
import { buildQuotePdf, quotePdfFileName } from "@/lib/quote-pdf";
import { loadQuotePhotos } from "@/lib/quote-photos";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const source = await readClientQuoteSource(token);
  if (!source) return new Response("Not found", { status: 404 });

  const [logo, business] = await Promise.all([
    getBusinessLogoBytes(source.organizationId),
    getBusinessConfigForOrganization(source.organizationId),
  ]);
  const photos = await loadQuotePhotos(source.pdfQuote, source.organizationId);
  const pdf = await buildQuotePdf(
    source.pdfQuote,
    source.pdfItems,
    logo,
    photos,
    business.profile,
    {
      showLineItemPrices: business.quotePreferences.showCustomerLineItemPrices,
    },
  );
  const fileName = (
    source.view.acceptance
      ? quotePdfFileName(source.pdfQuote, business.profile.name).replace(
          /\.pdf$/i,
          " - Signed.pdf",
        )
      : quotePdfFileName(source.pdfQuote, business.profile.name)
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
