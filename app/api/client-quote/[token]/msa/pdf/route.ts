import { getOperatingSettings } from "@/lib/operating-settings.server";
import { readClientQuoteSource } from "@/lib/client-quote";
import { premiumAgreementEnabled } from "@/lib/agreements";
import { buildMsaPdf } from "@/lib/msa-pdf";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const source = await readClientQuoteSource(token);
  if (
    source &&
    !(await getOperatingSettings(source.organizationId)).portal.agreements
  )
    return new Response("This section is not enabled in the customer portal.", {
      status: 403,
    });
  if (!source || !premiumAgreementEnabled(source.organizationId))
    return new Response(null, { status: 404 });
  const agreement = source?.view.msa;
  if (!source?.view.approved || !agreement || agreement.status !== "signed")
    return new Response(null, { status: 404 });
  const bytes = await buildMsaPdf(agreement);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Premium-Remodel-MSA-${agreement.quoteNumber.replace(/[^a-zA-Z0-9-]/g, "") || "signed"}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
