import "server-only";

import type { WorkspaceUser } from "./auth";
import { getBusinessConfig } from "./business-config";
import { configuredDiscordLeadWebhook } from "./discord-leads";
import { googleCalendarStatus } from "./google-calendar";
import { googleMailStatus } from "./google-mail";
import { isOriginalOrganization } from "./original-organization";
import type {
  OrganizationConnectionCapability,
  OrganizationConnectionId,
  OrganizationConnectionRegistry,
  OrganizationConnectionState,
} from "./organization-connections.types";
import { listOrganizationSecrets } from "./organization-secrets";
import { stripeConnectConfigured, stripeConnectStatus } from "./stripe-connect";
import { organizationStripeEnabled } from "./stripe-payments";
import { supabaseAdmin } from "./supabase/server";
import { hasTwilioConnection } from "./twilio-connection-store";

const connectionsHref = "/?view=Settings#connections";

function capability(
  id: OrganizationConnectionId,
  label: string,
  state: OrganizationConnectionState,
  detail: string,
  options: Partial<
    Pick<OrganizationConnectionCapability, "setupHref" | "optional" | "scope">
  > = {},
): OrganizationConnectionCapability {
  return {
    id,
    label,
    state,
    detail,
    setupHref: options.setupHref || connectionsHref,
    optional: options.optional ?? true,
    scope: options.scope || "organization",
  };
}

export async function getOrganizationConnectionRegistry(
  user: WorkspaceUser,
): Promise<OrganizationConnectionRegistry> {
  const [
    config,
    mail,
    calendar,
    smsConnected,
    stripeReady,
    stripeConnection,
    inboundHooks,
    secrets,
  ] = await Promise.all([
    getBusinessConfig(user),
    googleMailStatus(user),
    googleCalendarStatus(user),
    hasTwilioConnection(user.organizationId),
    organizationStripeEnabled(user.organizationId),
    stripeConnectStatus(user.organizationId),
    supabaseAdmin()
      .from("remodel_workflow_inbound_webhooks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", user.organizationId)
      .eq("enabled", true),
    listOrganizationSecrets(user.organizationId),
  ]);
  if (inboundHooks.error) throw inboundHooks.error;

  let teamNotificationReady = false;
  try {
    teamNotificationReady =
      isOriginalOrganization(user.organizationId) &&
      Boolean(configuredDiscordLeadWebhook());
  } catch {
    teamNotificationReady = false;
  }

  const stripeSelected = config.quotePreferences.paymentProvider === "stripe";
  const stripeState: OrganizationConnectionState = !config.modules.payments
    ? "disabled"
    : !stripeSelected
      ? "disabled"
      : stripeReady
        ? "ready"
        : stripeConnection
          ? "degraded"
          : "missing";
  const stripeDetail = !config.modules.payments
    ? "Payments are disabled for this business. Manual records remain available."
    : !stripeSelected
      ? "Manual payments are selected. Connect Stripe only when card collection is needed."
      : stripeReady
        ? "Stripe is connected and ready to collect card payments."
        : stripeConnection
          ? "Stripe is connected but still needs account verification before collecting payments."
          : stripeConnectConfigured()
            ? "Connect this business’s Stripe account before collecting card payments."
            : "Stripe needs one-time ServiceBuddy platform setup before this business can connect.";

  const calendarState: OrganizationConnectionState = !calendar.configured
    ? "missing"
    : !calendar.connected
      ? "missing"
      : calendar.lastError
        ? "degraded"
        : "ready";

  const originalWebsite = isOriginalOrganization(user.organizationId);
  const websiteReady = originalWebsite || (inboundHooks.count || 0) > 0;
  const automationsEnabled = config.modules.automations;
  const imageGenerationEnabled = config.modules.imageGeneration;

  return {
    organizationId: user.organizationId,
    checkedAt: new Date().toISOString(),
    capabilities: {
      google_mail: capability(
        "google_mail",
        "Company email",
        mail.connected ? "ready" : "missing",
        mail.connected
          ? `Quote and workflow email sends from ${mail.email}.`
          : mail.configured
            ? "Connect the company Gmail account before sending customer email."
            : "Google email needs one-time ServiceBuddy platform setup before this business can connect.",
        { optional: false },
      ),
      google_calendar: capability(
        "google_calendar",
        "Google Calendar",
        calendarState,
        calendarState === "ready"
          ? `Your workspace calendar is connected${calendar.email ? ` to ${calendar.email}` : ""}.`
          : calendarState === "degraded"
            ? calendar.lastError || "Calendar sync needs attention."
            : calendar.configured
              ? "Connect your Google account to receive a private copy of the workspace schedule."
              : "Google Calendar needs one-time ServiceBuddy platform setup. The built-in schedule remains available.",
        {
          setupHref: "/?view=Settings#account",
          scope: "person",
        },
      ),
      twilio_sms: capability(
        "twilio_sms",
        "Company texting",
        smsConnected ? "ready" : "missing",
        smsConnected
          ? "The company Twilio account is connected."
          : "Connect the company Twilio account before sending text messages.",
        { optional: false },
      ),
      stripe_payments: capability(
        "stripe_payments",
        "Card payments",
        stripeState,
        stripeDetail,
        { setupHref: "/?view=Settings#business" },
      ),
      openrouter_generation: capability(
        "openrouter_generation",
        "AI tools",
        !imageGenerationEnabled
          ? "disabled"
          : process.env.OPENROUTER_API_KEY
            ? "ready"
            : "missing",
        !imageGenerationEnabled
          ? "AI generation is disabled for this business."
          : process.env.OPENROUTER_API_KEY
            ? "OpenRouter is connected for proposal imports and renovation previews."
            : "OpenRouter needs platform configuration before this business can import proposals or generate previews.",
        {
          setupHref: "/?view=Settings#workspace",
          scope: "platform",
        },
      ),
      team_notifications: capability(
        "team_notifications",
        "Team notifications",
        !automationsEnabled
          ? "disabled"
          : teamNotificationReady
            ? "ready"
            : "missing",
        !automationsEnabled
          ? "Automations are disabled for this business."
          : teamNotificationReady
            ? "The team notification destination is connected."
            : "Connect a team notification destination before publishing required notification actions.",
      ),
      website_leads: capability(
        "website_leads",
        "Website lead intake",
        !automationsEnabled ? "disabled" : websiteReady ? "ready" : "missing",
        !automationsEnabled
          ? "Automations are disabled for this business."
          : websiteReady
            ? "A website lead endpoint is ready for this business."
            : "Publish a webhook-triggered lead workflow and add its endpoint to the business website.",
        { optional: false },
      ),
      workflow_secrets: capability(
        "workflow_secrets",
        "Workflow secrets",
        secrets.length ? "ready" : "missing",
        secrets.length
          ? `${secrets.length} organization secret${secrets.length === 1 ? " is" : "s are"} available to workflows.`
          : "Add an organization secret before using protected webhook URLs or headers.",
      ),
    },
  };
}
