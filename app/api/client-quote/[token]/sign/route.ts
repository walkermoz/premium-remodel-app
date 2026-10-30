import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { apiError, checkOrigin, HttpError, limitAttempts } from "@/lib/auth";
import { readClientQuoteSource } from "@/lib/client-quote";
import { syncLeadStageFromClientAcceptance } from "@/lib/lead-records";
import { parseClientPortalToken } from "@/lib/client-portal";
import { signatureStrokesSchema } from "@/lib/quote-signature";
import { changeOrderTerms, paymentTerms } from "@/lib/quote-pdf";
import { acceptedScopeSnapshot } from "@/lib/msa-draft";
import { preparedMsaMatchesQuote } from "@/lib/msa-quote-match";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { QuoteAcceptance } from "@/lib/types";

export const runtime = "nodejs";

const signInput = z.object({
  signedName: z.string().trim().min(2).max(100),
  quoteUpdatedAt: z.iso.datetime(),
  signatureStrokes: signatureStrokesSchema,
  acceptedTerms: z.literal(true),
});

function contractualQuote(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const comparable = { ...value } as Record<string, unknown>;
  delete comparable.updatedAt;
  delete comparable.quoteSentAt;
  delete comparable.quoteOnsiteAt;
  for (const [key, item] of Object.entries(comparable))
    if (item === undefined) delete comparable[key];
  return comparable;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    checkOrigin(request);
    const { token } = await params;
    const linkId = parseClientPortalToken(token);
    if (!linkId) throw new HttpError(404, "Quote link not found.");
    await limitAttempts(`client-quote-sign:${linkId}`, 8);

    const raw = await request.text();
    if (raw.length > 100_000)
      throw new HttpError(413, "Signature is too large.");
    const input = signInput.parse(JSON.parse(raw));
    const source = await readClientQuoteSource(token);
    if (!source) throw new HttpError(404, "Quote link not found.");
    if (source.view.approved) {
      if (source.view.acceptance)
        return Response.json({
          accepted: true,
          signedAt: source.view.acceptance.signedAt,
          nextStep: source.view.msa?.status === "sent" ? "msa" : undefined,
        });
      throw new HttpError(409, "This quote has already been accepted.");
    }
    if (input.quoteUpdatedAt !== source.pdfQuote.updatedAt)
      throw new HttpError(409, "This quote changed. Refresh before signing.");
    if (
      !isDeepStrictEqual(
        contractualQuote(source.currentQuote),
        contractualQuote(source.pdfQuote),
      )
    )
      throw new HttpError(409, "This quote changed. Refresh before signing.");

    // Recheck revocation close to the write so a previously opened tab cannot
    // accept a quote through a link that has since been replaced.
    const activeLink = await supabaseAdmin()
      .from("remodel_client_links")
      .select("id")
      .eq("id", linkId)
      .is("revoked_at", null)
      .maybeSingle();
    if (activeLink.error) throw activeLink.error;
    if (!activeLink.data) throw new HttpError(404, "Quote link not found.");

    const now = new Date(
      Math.max(Date.now(), Date.parse(source.recordUpdatedAt) + 1),
    ).toISOString();
    const ip = (
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      ""
    )
      .split(",")[0]
      .trim()
      .slice(0, 80);
    const acceptance: QuoteAcceptance = {
      signedName: input.signedName,
      signedAt: now,
      signatureStrokes: input.signatureStrokes,
      linkId,
      quoteUpdatedAt: source.pdfQuote.updatedAt,
      quoteSnapshotSha256: createHash("sha256")
        .update(
          JSON.stringify({
            quote: source.view.quote,
            items: source.view.items,
            total: source.view.total,
            changeOrderTerms,
            paymentTerms,
          }),
        )
        .digest("hex"),
      agreementText:
        "I agree to this quote and the terms above, and I intend my electronic signature to accept it.",
      ip,
      userAgent: (request.headers.get("user-agent") || "").slice(0, 300),
    };
    const preparedMsa = source.currentQuote.msaAgreement;
    if (
      preparedMsa?.status === "prepared" &&
      !preparedMsaMatchesQuote(source.currentQuote, source.pdfItems)
    )
      throw new HttpError(
        409,
        "The agreement no longer matches this quote. Ask Premium Remodel to update it before signing.",
      );
    const nextStep = preparedMsa?.status === "prepared" ? "msa" : undefined;
    const acceptedQuote = {
      ...source.pdfQuote,
      quoteSentAt:
        source.currentQuote.quoteSentAt || source.pdfQuote.quoteSentAt,
      quoteOnsiteAt: source.currentQuote.quoteOnsiteAt,
      status: "Accepted" as const,
      quoteAcceptedAt: now,
      quoteAcceptedBy: `client-link:${linkId}`,
      updatedAt: now,
      contractPrice: source.view.total,
      acceptedQuoteScope: acceptedScopeSnapshot(
        source.view.items,
        source.pdfQuote.category,
      ),
      quoteAcceptance: acceptance,
      msaAgreement:
        preparedMsa?.status === "prepared"
          ? { ...preparedMsa, status: "sent" as const, sentAt: now }
          : preparedMsa,
    };
    const { data, error } = await supabaseAdmin()
      .from("remodel_records")
      .update({
        data: acceptedQuote,
        updated_at: now,
        updated_by: null,
      })
      .eq("organization_id", source.organizationId)
      .eq("id", source.pdfQuote.id)
      .eq("kind", "quote")
      .eq("updated_at", source.recordUpdatedAt)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new HttpError(409, "This quote changed. Refresh before signing.");
    await syncLeadStageFromClientAcceptance(
      source.organizationId,
      source.pdfQuote.leadId,
    );
    return Response.json(
      { accepted: true, signedAt: now, nextStep },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
