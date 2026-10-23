import { createHash } from "node:crypto";
import { z } from "zod";
import { apiError, checkOrigin, HttpError, limitAttempts } from "@/lib/auth";
import { readClientQuoteSource } from "@/lib/client-quote";
import { syncLeadStageFromClientAcceptance } from "@/lib/lead-records";
import { parseClientPortalToken } from "@/lib/client-portal";
import { signatureStrokesSchema } from "@/lib/quote-signature";
import { changeOrderTerms, paymentTerms } from "@/lib/quote-pdf";
import { acceptedQuote } from "@/lib/quotes";
import { acceptedScopeSnapshot } from "@/lib/msa-draft";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { QuoteAcceptance } from "@/lib/types";

export const runtime = "nodejs";

const signInput = z.object({
  signedName: z.string().trim().min(2).max(100),
  quoteUpdatedAt: z.iso.datetime(),
  signatureStrokes: signatureStrokesSchema,
  acceptedTerms: z.literal(true),
});

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
        });
      throw new HttpError(409, "This quote has already been accepted.");
    }
    if (input.quoteUpdatedAt !== source.pdfQuote.updatedAt)
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
      Math.max(Date.now(), Date.parse(source.pdfQuote.updatedAt) + 1),
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
    const project = {
      ...acceptedQuote(source.pdfQuote, `client-link:${linkId}`, now),
      contractPrice: source.view.total,
      acceptedQuoteScope: acceptedScopeSnapshot(
        source.view.items,
        source.pdfQuote.category,
      ),
      quoteAcceptance: acceptance,
    };
    const { data, error } = await supabaseAdmin()
      .from("remodel_records")
      .update({
        kind: "project",
        data: project,
        updated_at: now,
        updated_by: null,
      })
      .eq("organization_id", source.organizationId)
      .eq("id", source.pdfQuote.id)
      .eq("kind", "quote")
      .eq("updated_at", source.pdfQuote.updatedAt)
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new HttpError(409, "This quote changed. Refresh before signing.");
    await syncLeadStageFromClientAcceptance(
      source.organizationId,
      source.pdfQuote.leadId,
    );
    return Response.json(
      { accepted: true, signedAt: now },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
