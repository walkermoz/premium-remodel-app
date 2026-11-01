import "server-only";

import type { OrganizationPaymentProviderId } from "./business-config-schema";
import {
  organizationStripeEnabled,
  organizationStripePayoutsEnabled,
  stripeContextForOrganization,
  stripeRequestOptions,
} from "./stripe-payments";

export type PaymentProviderStatus = {
  configured: boolean;
  ready: boolean;
  detail?: string;
};

export type PaymentCheckoutInput = {
  organizationId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

export type PaymentCheckoutResult = {
  externalId: string;
  url: string;
};

export type PaymentProviderAdapter = {
  id: OrganizationPaymentProviderId;
  label: string;
  capabilities: {
    onlineCheckout: boolean;
    savedPaymentMethods: boolean;
    financing: boolean;
  };
  status(organizationId: string): Promise<PaymentProviderStatus>;
  createCheckout?(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
};

const manualAdapter: PaymentProviderAdapter = {
  id: "manual",
  label: "Manual payments",
  capabilities: {
    onlineCheckout: false,
    savedPaymentMethods: false,
    financing: false,
  },
  async status() {
    return { configured: true, ready: true };
  },
};

const stripeAdapter: PaymentProviderAdapter = {
  id: "stripe",
  label: "Stripe",
  capabilities: {
    onlineCheckout: true,
    savedPaymentMethods: true,
    financing: false,
  },
  async status(organizationId) {
    if (!(await organizationStripeEnabled(organizationId)))
      return {
        configured: false,
        ready: false,
        detail: "Connect Stripe before collecting online payments.",
      };
    try {
      const ready = await organizationStripePayoutsEnabled(organizationId);
      return {
        configured: true,
        ready,
        ...(ready
          ? {}
          : {
              detail:
                "Stripe payouts are paused or unavailable. Complete the account verification task in Stripe before collecting by card.",
            }),
      };
    } catch {
      return {
        configured: true,
        ready: false,
        detail:
          "Stripe account status is unavailable. Online payments stay disabled until it can be confirmed.",
      };
    }
  },
  async createCheckout(input) {
    const context = await stripeContextForOrganization(input.organizationId);
    const session = await context.stripe.checkout.sessions.create(
      {
        mode: "payment",
        allowed_payment_method_types: ["card"],
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        customer_email: input.customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: { name: input.description.slice(0, 127) },
            },
            quantity: 1,
          },
        ],
        metadata: input.metadata,
        payment_intent_data: { metadata: input.metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      stripeRequestOptions(context),
    );
    if (!session.url) throw new Error("Stripe did not return a payment URL.");
    return { externalId: session.id, url: session.url };
  },
};

const adapters: Record<OrganizationPaymentProviderId, PaymentProviderAdapter> = {
  manual: manualAdapter,
  stripe: stripeAdapter,
};

export function paymentProviderAdapter(id: OrganizationPaymentProviderId) {
  return adapters[id];
}

export function paymentProviderCatalog() {
  return Object.values(adapters).map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    capabilities: adapter.capabilities,
  }));
}
