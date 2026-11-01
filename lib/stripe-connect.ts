import "server-only";

import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { appOrigin, HttpError, type WorkspaceUser } from "./auth";
import {
  sealOrganizationValue,
  unsealOrganizationValue,
} from "./organization-secrets";
import { supabaseAdmin } from "./supabase/server";

export const stripeConnectCookie = "servicebuddy_stripe_connect";

type StripeConnectionRow = {
  id: string;
  organization_id: string;
  provider: "stripe";
  connection_mode: "stripe_connect";
  status: "pending" | "active" | "restricted" | "disconnected";
  external_account_id: string;
  display_name: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  capabilities: Record<string, string>;
  connected_at: string;
  updated_at: string;
};

function connectConfig() {
  return {
    clientId: process.env.STRIPE_CONNECT_CLIENT_ID?.trim() || "",
    secretKey:
      process.env.STRIPE_PLATFORM_SECRET_KEY?.trim() ||
      process.env.STRIPE_SECRET_KEY?.trim() ||
      "",
    webhookSecret:
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || "",
  };
}

export function stripeConnectConfigured() {
  const config = connectConfig();
  return (
    config.clientId.startsWith("ca_") &&
    config.secretKey.startsWith("sk_") &&
    config.webhookSecret.startsWith("whsec_")
  );
}

export function stripePlatformClient() {
  const key = connectConfig().secretKey;
  if (!key.startsWith("sk_"))
    throw new HttpError(503, "Stripe Connect is not configured yet.");
  return new Stripe(key);
}

export function stripeConnectWebhookSecret() {
  return connectConfig().webhookSecret;
}

function redirectUri(request: Request) {
  return `${appOrigin(request)}/api/stripe/connect/callback`;
}

export function stripeConnectAuthorization(
  request: Request,
  user: WorkspaceUser,
) {
  if (!stripeConnectConfigured())
    throw new HttpError(
      503,
      "Stripe Connect needs one-time platform setup before businesses can connect.",
    );
  const state = randomBytes(32).toString("base64url");
  const cookie = sealOrganizationValue(
    JSON.stringify({
      state,
      organizationId: user.organizationId,
      profileId: user.id,
      expiresAt: Date.now() + 10 * 60_000,
    }),
    user.organizationId,
    user.id,
  );
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: connectConfig().clientId,
    scope: "read_write",
    state,
    redirect_uri: redirectUri(request),
  }).toString();
  return { url: url.toString(), cookie };
}

function parseState(user: WorkspaceUser, cookie: string) {
  let value: unknown;
  try {
    value = JSON.parse(
      unsealOrganizationValue(cookie, user.organizationId, user.id),
    );
  } catch {
    throw new HttpError(400, "The Stripe connection request expired.");
  }
  if (!value || typeof value !== "object")
    throw new HttpError(400, "The Stripe connection request expired.");
  const state = value as Record<string, unknown>;
  if (
    state.organizationId !== user.organizationId ||
    state.profileId !== user.id ||
    typeof state.state !== "string" ||
    typeof state.expiresAt !== "number" ||
    state.expiresAt < Date.now()
  )
    throw new HttpError(400, "The Stripe connection request expired.");
  return state.state;
}

function connectionDto(row: StripeConnectionRow) {
  return {
    id: row.id,
    provider: row.provider,
    mode: row.connection_mode,
    status: row.status,
    accountId: row.external_account_id,
    displayName: row.display_name,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted,
    capabilities: row.capabilities,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

export async function stripeConnectRow(organizationId: string) {
  const result = await supabaseAdmin()
    .from("remodel_payment_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "stripe")
    .neq("status", "disconnected")
    .maybeSingle();
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code)) return null;
    throw result.error;
  }
  return (result.data as unknown as StripeConnectionRow | null) || null;
}

export async function stripeConnectStatus(organizationId: string) {
  const row = await stripeConnectRow(organizationId);
  return row ? connectionDto(row) : null;
}

export async function connectStripeAccount(
  request: Request,
  user: WorkspaceUser,
  code: string,
  state: string,
  stateCookie: string,
  fetcher: typeof fetch = fetch,
) {
  if (parseState(user, stateCookie) !== state)
    throw new HttpError(400, "The Stripe connection request expired.");
  const response = await fetcher("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_secret: connectConfig().secretKey,
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const token = (await response.json().catch(() => null)) as {
    stripe_user_id?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !token?.stripe_user_id?.startsWith("acct_"))
    throw new HttpError(
      502,
      token?.error_description || "Stripe could not connect this account.",
    );
  const account = await stripePlatformClient().accounts.retrieve(
    token.stripe_user_id,
  );
  const now = new Date().toISOString();
  const status =
    account.charges_enabled && account.payouts_enabled
      ? "active"
      : "restricted";
  const saved = await supabaseAdmin()
    .from("remodel_payment_connections")
    .upsert(
      {
        organization_id: user.organizationId,
        provider: "stripe",
        connection_mode: "stripe_connect",
        status,
        external_account_id: account.id,
        display_name:
          account.business_profile?.name ||
          account.settings?.dashboard?.display_name ||
          account.email ||
          "Stripe account",
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        capabilities: account.capabilities || {},
        connected_by: user.id,
        connected_at: now,
        updated_at: now,
        disconnected_at: null,
      },
      { onConflict: "organization_id,provider" },
    )
    .select("*")
    .single();
  if (saved.error) {
    if (saved.error.code === "23505")
      throw new HttpError(
        409,
        "That Stripe account is already connected to another business.",
      );
    throw saved.error;
  }
  return connectionDto(saved.data as unknown as StripeConnectionRow);
}

export async function refreshStripeConnectAccount(organizationId: string) {
  const current = await stripeConnectRow(organizationId);
  if (!current) return null;
  const account = await stripePlatformClient().accounts.retrieve(
    current.external_account_id,
  );
  const status =
    account.charges_enabled && account.payouts_enabled
      ? "active"
      : "restricted";
  const result = await supabaseAdmin()
    .from("remodel_payment_connections")
    .update({
      status,
      display_name:
        account.business_profile?.name ||
        account.settings?.dashboard?.display_name ||
        account.email ||
        current.display_name,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      capabilities: account.capabilities || {},
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("provider", "stripe")
    .select("*")
    .single();
  if (result.error) throw result.error;
  return connectionDto(result.data as unknown as StripeConnectionRow);
}

export async function disconnectStripeAccount(
  user: WorkspaceUser,
  fetcher: typeof fetch = fetch,
) {
  const current = await stripeConnectRow(user.organizationId);
  if (!current) return { disconnected: false };
  const config = connectConfig();
  const revoked = await fetcher("https://connect.stripe.com/oauth/deauthorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.secretKey,
      stripe_user_id: current.external_account_id,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!revoked.ok)
    throw new HttpError(
      502,
      "Stripe could not disconnect the account. No workspace settings were changed.",
    );
  const result = await supabaseAdmin()
    .from("remodel_payment_connections")
    .update({
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organizationId)
    .eq("provider", "stripe")
    .neq("status", "disconnected")
    .select("id");
  if (result.error) throw result.error;
  return { disconnected: Boolean(result.data.length) };
}

/** Lifecycle variant without a signed-in member; used only by the cron executor. */
export async function disconnectStripeAccountForOrganization(
  organizationId: string,
  fetcher: typeof fetch = fetch,
) {
  const current = await stripeConnectRow(organizationId);
  if (!current) return { disconnected: false };
  const config = connectConfig();
  if (!config.clientId || !config.secretKey)
    throw new HttpError(
      503,
      "Stripe Connect is unavailable. Organization deletion was paused.",
    );
  const revoked = await fetcher("https://connect.stripe.com/oauth/deauthorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.secretKey,
      stripe_user_id: current.external_account_id,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!revoked.ok)
    throw new HttpError(
      502,
      "Stripe could not disconnect the account. Organization deletion was paused.",
    );
  const result = await supabaseAdmin()
    .from("remodel_payment_connections")
    .delete()
    .eq("organization_id", organizationId)
    .eq("provider", "stripe");
  if (result.error) throw result.error;
  return { disconnected: true };
}

export async function organizationIdForStripeAccount(accountId: string) {
  const result = await supabaseAdmin()
    .from("remodel_payment_connections")
    .select("organization_id")
    .eq("provider", "stripe")
    .eq("external_account_id", accountId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.organization_id || null;
}
