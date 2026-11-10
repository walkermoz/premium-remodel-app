import "server-only";

import { parseClientPortalToken } from "./client-portal";
import {
  organizationStripeEnabled,
  stripeContextForOrganization,
  stripeRequestOptions,
} from "./stripe-payments";
import { supabaseAdmin } from "./supabase/server";

export async function walletCustomerId(token: string) {
  const id = parseClientPortalToken(token);
  if (!id) return null;
  const { data, error } = await supabaseAdmin()
    .from("remodel_client_links")
    .select("stripe_customer_id,stripe_account_id,organization_id")
    .eq("id", id)
    .in("kind", ["project", "quote"])
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function savedPaymentMethods(token: string) {
  const wallet = await walletCustomerId(token);
  if (
    !wallet?.stripe_customer_id ||
    !(await organizationStripeEnabled(wallet.organization_id))
  )
    return [];
  const customer = wallet.stripe_customer_id;
  const context = await stripeContextForOrganization(wallet.organization_id);
  if ((wallet.stripe_account_id || null) !== context.accountId) return [];
  const [cards, banks] = await Promise.all([
    context.stripe.paymentMethods.list(
      { customer, type: "card", limit: 20 },
      stripeRequestOptions(context),
    ),
    context.stripe.paymentMethods.list(
      {
        customer,
        type: "us_bank_account",
        limit: 20,
      },
      stripeRequestOptions(context),
    ),
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
