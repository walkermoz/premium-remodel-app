import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { msaPaymentRows } from "@/lib/msa-contract";
import { promotePaidQuote } from "@/lib/quote-promotion";
import { dollarsToCents } from "@/lib/stripe-payment-utils";
import { stripeClient } from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Activity, Quote } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

const inputSchema = z.object({
  requestId: z.uuid(),
  amount: z.string(),
  checkReference: z.string().trim().max(100).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can record a check deposit.",
      );
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new HttpError(400, "Choose a valid quote.");
    const input = inputSchema.parse(await request.json());
    const amountCents = dollarsToCents(input.amount);
    if (!amountCents)
      throw new HttpError(
        400,
        "Enter the amount received in dollars and cents.",
      );
    const admin = supabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from("remodel_records")
      .select("kind,project_id,data")
      .eq("organization_id", user.organizationId)
      .eq("id", input.requestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (
        existing.kind !== "activity" ||
        existing.project_id !== id ||
        existing.data?.paymentMethod !== "Check" ||
        Math.round(Number(existing.data?.amount || 0) * 100) !== amountCents
      )
        throw new HttpError(
          409,
          "This payment request ID was used for another record.",
        );
      const promoted = await promotePaidQuote(user.organizationId, id);
      return Response.json({ recorded: true, projectReady: Boolean(promoted) });
    }
    const { data: row, error } = await admin
      .from("remodel_records")
      .select("kind,data")
      .eq("organization_id", user.organizationId)
      .eq("id", id)
      .eq("kind", "quote")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "Quote not found.");
    const quote = row.data as Quote;
    const agreement = quote.msaAgreement;
    if (
      quote.status !== "Accepted" ||
      !quote.quoteAcceptance ||
      agreement?.status !== "signed" ||
      !agreement.customerSignature
    )
      throw new HttpError(
        409,
        "The quote scope and MSA must be signed before recording a deposit.",
      );
    const depositCents = Math.round(msaPaymentRows(agreement)[0]?.amount * 100);
    if (!Number.isSafeInteger(depositCents) || depositCents <= 0)
      throw new HttpError(409, "The signed MSA has no valid deposit amount.");
    const { data: paymentRows, error: paymentError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", user.organizationId)
      .eq("project_id", id)
      .eq("kind", "activity")
      .limit(1001);
    if (paymentError) throw paymentError;
    if (paymentRows.length > 1000)
      throw new HttpError(
        409,
        "Too many payment records to verify automatically.",
      );
    const paidCents = paymentRows.reduce((sum, row) => {
      const payment = row.data as Activity;
      return payment.activityType === "Payment received"
        ? sum + Math.round((payment.amount || 0) * 100)
        : sum;
    }, 0);
    const dueCents = Math.max(0, depositCents - paidCents);
    if (dueCents <= 0)
      throw new HttpError(409, "The deposit has already been recorded.");
    if (amountCents > dueCents)
      throw new HttpError(
        400,
        "The amount exceeds the remaining deposit. Record any extra payment after the project is created.",
      );
    const now = new Date().toISOString();
    const data = {
      id: input.requestId,
      projectId: id,
      activityType: "Payment received",
      actorId: user.id,
      actorName: user.name,
      authorId: user.id,
      authorName: user.name,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      summary: "Check deposit received",
      notes: input.checkReference
        ? `Check reference: ${input.checkReference}`
        : "Received by check.",
      amount: amountCents / 100,
      party: quote.client,
      paymentMethod: "Check",
      contractorId: "",
      attachmentIds: [],
    };
    const { error: insertError } = await admin.from("remodel_records").insert({
      id: input.requestId,
      organization_id: user.organizationId,
      created_by: user.id,
      updated_by: user.id,
      kind: "activity",
      project_id: id,
      data,
      updated_at: now,
    });
    if (insertError) throw insertError;
    if (agreement.depositCheckout?.sessionId && process.env.STRIPE_SECRET_KEY) {
      try {
        await stripeClient(user.organizationId).checkout.sessions.expire(
          agreement.depositCheckout.sessionId,
        );
      } catch {
        // A completed or previously expired checkout cannot be expired again.
      }
    }
    const promoted = await promotePaidQuote(user.organizationId, id);
    return Response.json({ recorded: true, projectReady: Boolean(promoted) });
  } catch (error) {
    return apiError(error);
  }
}
