export const organizationConnectionIds = [
  "google_mail",
  "google_calendar",
  "twilio_sms",
  "stripe_payments",
  "openrouter_generation",
  "team_notifications",
  "website_leads",
  "workflow_secrets",
] as const;

export type OrganizationConnectionId =
  (typeof organizationConnectionIds)[number];

export type OrganizationConnectionState =
  "ready" | "missing" | "degraded" | "disabled";

export type OrganizationConnectionCapability = {
  id: OrganizationConnectionId;
  label: string;
  state: OrganizationConnectionState;
  detail: string;
  setupHref: string;
  optional: boolean;
  scope: "organization" | "person" | "platform";
};

export type OrganizationConnectionRegistry = {
  organizationId: string;
  checkedAt: string;
  capabilities: Record<
    OrganizationConnectionId,
    OrganizationConnectionCapability
  >;
};

export function connectionIsReady(
  capability: OrganizationConnectionCapability | null | undefined,
) {
  return capability?.state === "ready";
}

export function demoConnectionRegistry(): OrganizationConnectionRegistry {
  const capability = (
    id: OrganizationConnectionId,
    label: string,
  ): OrganizationConnectionCapability => ({
    id,
    label,
    state: "ready",
    detail: `${label} is available in the sample workspace.`,
    setupHref: "/?view=Settings#connections",
    optional: true,
    scope: "organization",
  });
  return {
    organizationId: "demo",
    checkedAt: new Date(0).toISOString(),
    capabilities: {
      google_mail: capability("google_mail", "Company email"),
      google_calendar: {
        ...capability("google_calendar", "Google Calendar"),
        scope: "person",
        setupHref: "/?view=Settings#account",
      },
      twilio_sms: capability("twilio_sms", "Company texting"),
      stripe_payments: capability("stripe_payments", "Card payments"),
      openrouter_generation: {
        ...capability("openrouter_generation", "AI tools"),
        scope: "platform",
        setupHref: "/?view=Settings#workspace",
      },
      team_notifications: capability(
        "team_notifications",
        "Team notifications",
      ),
      website_leads: capability("website_leads", "Website lead intake"),
      workflow_secrets: capability("workflow_secrets", "Workflow secrets"),
    },
  };
}
