import { HttpError, limitAttempts, requestOrigin } from "@/lib/auth";
import { readClientQuote } from "@/lib/client-quote";
import {
  parseClientPortalToken,
  validClientWalletFormToken,
} from "@/lib/client-portal";
import { stripeClient } from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function walletUrl(request: Request, token: string, result?: string) {
  const url = new URL(
    `/client/${encodeURIComponent(token)}/quote`,
    requestOrigin(request),
  );
  url.searchParams.set("view", "wallet");
  if (result) url.searchParams.set("result", result);
  return url.toString();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!parseClientPortalToken(token) || !(await readClientQuote(token)))
    return new Response(null, { status: 404 });
  return Response.redirect(walletUrl(request, token), 303);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const id = parseClientPortalToken(token);
  if (!id) return new Response(null, { status: 404 });
  try {
    const form = await request.formData();
    if (!validClientWalletFormToken(token, form.get("authenticity")))
      return Response.redirect(walletUrl(request, token, "expired"), 303);
    const quote = await readClientQuote(token);
    if (!quote) return new Response(null, { status: 404 });
    if (!process.env.STRIPE_SECRET_KEY)
      return Response.redirect(walletUrl(request, token, "unavailable"), 303);
    await limitAttempts(`client-wallet:${id}`, 10);
    const method = form.get("method");
    if (method !== "card" && method !== "bank")
      throw new HttpError(400, "Choose a payment method.");

    const admin = supabaseAdmin();
    const { data: link, error } = await admin
      .from("remodel_client_links")
      .select("stripe_customer_id")
      .eq("id", id)
      .eq("kind", "quote")
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!link) return new Response(null, { status: 404 });

    const stripe = stripeClient();
    let customerId = link.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          name: quote.quote.client || undefined,
          metadata: { client_quote_id: quote.quote.id, client_link_id: id },
        },
        { idempotencyKey: `client-wallet-customer-${id}` },
      );
      const saved = await admin
        .from("remodel_client_links")
        .update({ stripe_customer_id: customer.id })
        .eq("id", id)
        .eq("kind", "quote")
        .is("revoked_at", null)
        .is("stripe_customer_id", null)
        .select("id");
      if (saved.error) throw saved.error;
      if (!saved.data.length) return new Response(null, { status: 404 });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      allowed_payment_method_types: [
        method === "card" ? "card" : "us_bank_account",
      ],
      billing_address_collection: "auto",
      client_reference_id: id,
      metadata: { source: "premium_remodel_client_wallet", client_link_id: id },
      setup_intent_data: {
        metadata: {
          source: "premium_remodel_client_wallet",
          client_link_id: id,
        },
      },
      success_url: walletUrl(request, token, "saved"),
      cancel_url: walletUrl(request, token),
    });
    if (!session.url) throw new Error("Stripe did not provide a setup URL.");
    return Response.redirect(session.url, 303);
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error(
      "Client payment method setup failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.redirect(walletUrl(request, token, "unavailable"), 303);
  }
}
