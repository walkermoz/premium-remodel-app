import { getBusinessLogoBytes } from "@/lib/business-logo";
import { getBusinessConfig } from "@/lib/business-config";
import { apiError, HttpError, requireUser } from "@/lib/auth";
import { buildQuotePdf, quotePdfFileName } from "@/lib/quote-pdf";
import { isValidClientQuoteSnapshot } from "@/lib/client-quote";
import { loadQuotePhotos } from "@/lib/quote-photos";
import { findRecord, getWorkspace } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Quote, ScopeItem } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot download quotes.");
    const { id } = await context.params;
    const quote = (await findRecord(user, id, "quote")) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");

    const workspace = await getWorkspace(user);
    let pdfQuote = quote;
    let pdfScope = workspace.scope;
    if (quote.quoteAcceptance) {
      const { data: link, error } = await supabaseAdmin()
        .from("remodel_client_links")
        .select("quote_snapshot")
        .eq("organization_id", user.organizationId)
        .eq("id", quote.quoteAcceptance.linkId)
        .eq("project_id", quote.id)
        .eq("kind", "quote")
        .maybeSingle();
      if (error) throw error;
      if (!link || !isValidClientQuoteSnapshot(link.quote_snapshot))
        throw new HttpError(409, "The signed quote snapshot is unavailable.");
      const snapshot = link.quote_snapshot as {
        quote: Quote;
        items: ScopeItem[];
      };
      if (
        snapshot.quote.id !== quote.id ||
        snapshot.items.some((item) => item.projectId !== quote.id)
      )
        throw new HttpError(409, "The signed quote snapshot is invalid.");
      pdfQuote = {
        ...snapshot.quote,
        quoteAcceptance: quote.quoteAcceptance,
        quoteAcceptedAt: quote.quoteAcceptedAt,
      };
      pdfScope = snapshot.items.map((item) => ({
        ...item,
        createdAt: item.createdAt || snapshot.quote.createdAt,
        updatedAt: item.updatedAt || snapshot.quote.updatedAt,
        quantity: item.quantity ?? 1,
        unit: item.unit || "job",
        subCost: item.subCost ?? 0,
        contractorId: item.contractorId || "",
        status: item.status || "To do",
      }));
    }
    const [logo, business] = await Promise.all([
      getBusinessLogoBytes(user.organizationId),
      getBusinessConfig(user),
    ]);
    const photos = await loadQuotePhotos(pdfQuote, user.organizationId);
    const bytes = await buildQuotePdf(
      pdfQuote,
      pdfScope,
      logo,
      photos,
      business.profile,
      {
        showLineItemPrices:
          business.quotePreferences.showCustomerLineItemPrices,
      },
    );
    const fileName = quotePdfFileName(pdfQuote, business.profile.name)
      .replace(/\.pdf$/, quote.quoteAcceptance ? " - Signed.pdf" : ".pdf")
      .replace(/["\\]/g, "");

    return new Response(Buffer.from(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="${fileName}"`,
        "Content-Length": String(bytes.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
