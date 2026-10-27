import "server-only";
import Stripe from "stripe";

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
