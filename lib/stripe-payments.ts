import "server-only";
import Stripe from "stripe";
import { stripeConnectRow, stripePlatformClient } from "./stripe-connect";

export type StripeConnection = {
  organizationId: string;
  secretKey: string;
  webhookSecret: string;
};

/** Server-only processor bindings. Each company must have its own account keys. */
export function stripeConnections(): StripeConnection[] {
  const connections = new Map<string, StripeConnection>();
  const legacyOrg =
    process.env.STRIPE_ORGANIZATION_ID || process.env.SUPABASE_ORGANIZATION_ID;
  if (
    legacyOrg &&
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET
  )
    connections.set(legacyOrg, {
      organizationId: legacyOrg,
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  try {
    const configured = JSON.parse(
      process.env.STRIPE_ACCOUNTS_JSON || "{}",
    ) as Record<
      string,
      {
        secretKey?: string;
        webhookSecret?: string;
      }
    >;
    for (const [organizationId, value] of Object.entries(configured)) {
      if (
        /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(organizationId) &&
        value?.secretKey?.startsWith("sk_") &&
        value.webhookSecret?.startsWith("whsec_")
      )
        connections.set(organizationId, {
          organizationId,
          secretKey: value.secretKey,
          webhookSecret: value.webhookSecret,
        });
    }
  } catch {
    // Malformed optional configuration cannot grant payment access.
  }
  return [...connections.values()];
}

export function stripeEnabledForOrganization(organizationId: string) {
  return stripeConnections().some(
    (connection) => connection.organizationId === organizationId,
  );
}

export function stripeClient(organizationId: string) {
  const connection = stripeConnections().find(
    (item) => item.organizationId === organizationId,
  );
  if (!connection)
    throw new Error("Stripe is not configured for this organization.");
  return new Stripe(connection.secretKey);
}

export type StripeExecutionContext = {
  stripe: Stripe;
  accountId: string | null;
  requestOptions: Stripe.RequestOptions | undefined;
  mode: "direct_legacy" | "stripe_connect";
};

/** Resolve the organization’s processor without exposing account credentials. */
export async function stripeContextForOrganization(
  organizationId: string,
): Promise<StripeExecutionContext> {
  const direct = stripeConnections().find(
    (connection) => connection.organizationId === organizationId,
  );
  if (direct)
    return {
      stripe: new Stripe(direct.secretKey),
      accountId: null,
      requestOptions: undefined,
      mode: "direct_legacy",
    };
  const connected = await stripeConnectRow(organizationId);
  if (!connected)
    throw new Error("Stripe is not configured for this organization.");
  return {
    stripe: stripePlatformClient(),
    accountId: connected.external_account_id,
    requestOptions: { stripeAccount: connected.external_account_id },
    mode: "stripe_connect",
  };
}

export async function organizationStripeEnabled(organizationId: string) {
  if (stripeEnabledForOrganization(organizationId)) return true;
  const connected = await stripeConnectRow(organizationId);
  return Boolean(
    connected?.status === "active" &&
      connected.charges_enabled &&
      connected.payouts_enabled,
  );
}

export async function organizationStripePayoutsEnabled(
  organizationId: string,
) {
  const context = await stripeContextForOrganization(organizationId);
  const account = context.accountId
    ? await context.stripe.accounts.retrieve(context.accountId)
    : await context.stripe.accounts.retrieve(null);
  return account.payouts_enabled === true && account.charges_enabled === true;
}

export function stripeRequestOptions(
  context: StripeExecutionContext,
  options: Stripe.RequestOptions = {},
) {
  return { ...options, ...(context.requestOptions || {}) };
}
