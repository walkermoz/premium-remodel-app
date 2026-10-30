import { z } from "zod";
import { requirePremiumAgreement } from "@/lib/agreements";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { createClientEmailToken } from "@/lib/client-portal";
import { ensureEmailedQuoteLink } from "@/lib/client-quote-link";
import { preparedMsaMatchesQuote } from "@/lib/msa-quote-match";
import { findRecord, getWorkspace, updateRecord } from "@/lib/repository";
import type { Quote } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    requirePremiumAgreement(user.organizationId);
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot start on-site signing.");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new HttpError(400, "Choose a valid quote.");
    await limitAttempts(`onsite-signing:${user.id}:${id}`, 12);
    const quote = (await findRecord(user, id, "quote")) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");
    if (quote.status !== "Draft" && quote.status !== "Sent")
      throw new HttpError(409, "This quote is not available for signing.");
    if (!quote.clientEmail)
      throw new HttpError(400, "Add the client's email to the quote first.");
    const workspace = await getWorkspace(user);
    if (!preparedMsaMatchesQuote(quote, workspace.scope))
      throw new HttpError(
        409,
        "Sign and prepare an MSA matching this quote before starting on-site signing.",
      );
    const now = new Date().toISOString();
    const linkId = await ensureEmailedQuoteLink(
      user,
      quote,
      workspace.scope,
      now,
    );
    if (quote.status !== "Sent" || !quote.quoteSentAt || !quote.quoteOnsiteAt)
      await updateRecord(
        user,
        quote,
        {
          ...quote,
          status: "Sent",
          quoteSentAt: quote.quoteSentAt || now,
          quoteOnsiteAt: now,
        },
        quote.updatedAt,
      );
    const token = createClientEmailToken(linkId, quote.clientEmail);
    return Response.json(
      { url: `${appOrigin(request)}/client/${token}/quote` },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
