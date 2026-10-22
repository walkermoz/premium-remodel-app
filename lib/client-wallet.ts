import "server-only";

import { parseClientPortalToken } from "./client-portal";
import { stripeClient } from "./stripe-payments";
import { supabaseAdmin } from "./supabase/server";

export async function walletCustomerId(token: string) {
  const id = parseClientPortalToken(token);
  if (!id) return null;
  const { data, error } = await supabaseAdmin()
    .from("remodel_client_links")
    .select("stripe_customer_id")
    .eq("id", id)
    .eq("kind", "quote")
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.stripe_customer_id || null;
}

export async function savedPaymentMethods(token: string) {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const customer = await walletCustomerId(token);
  if (!customer) return [];
  const stripe = stripeClient();
  const [cards, banks] = await Promise.all([
    stripe.paymentMethods.list({ customer, type: "card", limit: 20 }),
    stripe.paymentMethods.list({
      customer,
      type: "us_bank_account",
      limit: 20,
    }),
  ]);
  return [
    ...cards.data.map((method) => ({
      id: method.id,
      label: `${method.card?.brand || "Card"} ending in ${method.card?.last4 || "••••"}`,
      kind: "card" as const,
    })),
    ...banks.data.map((method) => ({
      id: method.id,
      label: `${method.us_bank_account?.bank_name || "Bank account"} ending in ${method.us_bank_account?.last4 || "••••"}`,
      kind: "bank" as const,
    })),
  ];
}
