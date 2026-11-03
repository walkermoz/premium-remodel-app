import { apiError, requireUser } from "@/lib/auth";
import { googleMailAddressForOrganization } from "@/lib/google-mail";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { listOrganizationSecrets } from "@/lib/organization-secrets";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import { getOrganizationConnectionRegistry } from "@/lib/organization-connections.server";
import { connectionIsReady } from "@/lib/organization-connections.types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    const [email, secrets, registry] = await Promise.all([
      googleMailAddressForOrganization(user.organizationId),
      listOrganizationSecrets(user.organizationId),
      getOrganizationConnectionRegistry(user),
    ]);
    const smsConnected = connectionIsReady(registry.capabilities.twilio_sms);
    const discordConnected = connectionIsReady(
      registry.capabilities.team_notifications,
    );
    return Response.json(
      {
        email: email ? [{ id: user.organizationId, label: email }] : [],
        sms: smsConnected
          ? [
              {
                id: user.organizationId,
                label: "Connected company texting number",
              },
            ]
          : [],
        webhook: discordConnected
          ? [
              {
                id: "discord_lead_webhook",
                label: "Connected Discord lead webhook",
              },
            ]
          : [],
        secrets: secrets.map((secret) => ({
          id: secret.id,
          label: secret.name,
        })),
        registry,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
