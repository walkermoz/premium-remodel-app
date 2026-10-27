import { HttpError, limitAttempts, requestOrigin } from "@/lib/auth";
import { premiumAgreementEnabled } from "@/lib/agreements";
import { readClientQuoteSource } from "@/lib/client-quote";
import {
  parseClientPortalToken,
  validClientWalletFormToken,
} from "@/lib/client-portal";
import { msaPaymentRows } from "@/lib/msa-contract";
import {
  stripeClient,
  stripeEnabledForOrganization,
} from "@/lib/stripe-payments";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Activity, Project, Quote } from "@/lib/types";

export const runtime = "nodejs";
function portalUrl(request: Request, token: string, result?: string) {
  const url = new URL(
    `/client/${encodeURIComponent(token)}/quote`,
    requestOrigin(request),
  );
  url.searchParams.set("view", "msa");
  if (result) url.searchParams.set("result", result);
  return url.toString();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const linkId = parseClientPortalToken(token);
  if (!linkId) return new Response(null, { status: 404 });
  try {
    const form = await request.formData();
    if (!validClientWalletFormToken(token, form.get("authenticity")))
      return Response.redirect(portalUrl(request, token, "expired"), 303);
    await limitAttempts(`msa-deposit:${linkId}`, 10);
    const source = await readClientQuoteSource(token);
    if (source && !premiumAgreementEnabled(source.organizationId))
      return new Response(null, { status: 404 });
    if (!source?.view.approved || source.view.msa?.status !== "signed")
      return new Response(null, { status: 404 });
    const business = await getBusinessConfigForOrganization(
      source.organizationId,
    );
    if (
      !business.features.payments ||
      business.quotePreferences.paymentProvider !== "stripe" ||
      !stripeEnabledForOrganization(source.organizationId)
    )
      return Response.redirect(portalUrl(request, token, "unavailable"), 303);
    const stripe = stripeClient(source.organizationId);
    if ((await stripe.accounts.retrieve(null)).payouts_enabled !== true)
      return Response.redirect(portalUrl(request, token, "unavailable"), 303);
    const admin = supabaseAdmin();
    const { data: row, error } = await admin
      .from("remodel_records")
      .select("kind,data,updated_at")
      .eq("organization_id", source.organizationId)
      .eq("id", source.pdfQuote.id)
      .in("kind", ["project", "quote"])
      .maybeSingle();
    if (error) throw error;
    const project = row?.data as Project | Quote | undefined;
    const agreement = project?.msaAgreement;
    if (
      !project ||
      agreement?.status !== "signed" ||
      (row?.kind === "quote" &&
        (project.status !== "Accepted" || !project.quoteAcceptance))
    )
      return new Response(null, { status: 404 });
    const { data: paymentRows, error: paymentError } = await admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", source.organizationId)
      .eq("project_id", project.id)
      .eq("kind", "activity")
      .limit(1000);
    if (paymentError) throw paymentError;
    const paidCents = paymentRows.reduce((sum, row) => {
      const payment = row.data as Activity;
      return payment.activityType === "Payment received"
        ? sum + Math.round((payment.amount || 0) * 100)
        : sum;
    }, 0);
    const depositCents = Math.round(msaPaymentRows(agreement)[0].amount * 100);
    const dueCents = Math.max(0, depositCents - paidCents);
    if (dueCents < 50)
      return Response.redirect(portalUrl(request, token, "paid"), 303);
    const existing = agreement.depositCheckout;
    if (existing && Date.parse(existing.expiresAt) > Date.now() + 60_000) {
      const session = await stripe.checkout.sessions.retrieve(
        existing.sessionId,
      );
      if (session.status === "open" && session.url)
        return Response.redirect(session.url, 303);
    }
    const metadata = {
      source: "premium_remodel_project",
      organizationId: source.organizationId,
      projectId: project.id,
      createdById: agreement.staffUserId,
      createdByName: agreement.staffSignature.name,
      amountCents: String(dueCents),
      msaTermsSha256: agreement.termsSha256,
      milestoneId: agreement.paymentSchedule[0].id,
    };
    const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      expires_at: expires,
      customer_email: agreement.ownerEmail,
      client_reference_id: linkId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: dueCents,
            product_data: {
              name: `${business.profile.name} deposit — ${agreement.projectName.slice(0, 100)}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: portalUrl(request, token, "payment-return"),
      cancel_url: portalUrl(request, token, "payment-canceled"),
    });
    if (!session.url) throw new Error("Stripe did not provide a checkout URL.");
    const now = new Date(
      Math.max(Date.now(), Date.parse(row!.updated_at) + 1),
    ).toISOString();
    const { data: updated, error: updateError } = await admin
      .from("remodel_records")
      .update({
        data: {
          ...project,
          msaAgreement: {
            ...agreement,
            depositCheckout: {
              sessionId: session.id,
              url: session.url,
              expiresAt: new Date(expires * 1000).toISOString(),
            },
          },
          updatedAt: now,
        },
        updated_at: now,
      })
      .eq("organization_id", source.organizationId)
      .eq("id", project.id)
      .eq("kind", row!.kind)
      .eq("updated_at", row!.updated_at)
      .select("id");
    if (updateError || !updated?.length) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      throw new HttpError(409, "The project changed. Please try again.");
    }
    return Response.redirect(session.url, 303);
  } catch (error) {
    console.error(
      "MSA deposit checkout failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.redirect(
      portalUrl(
        request,
        token,
        error instanceof HttpError && error.status === 429
          ? "rate-limit"
          : "unavailable",
      ),
      303,
    );
  }
}
