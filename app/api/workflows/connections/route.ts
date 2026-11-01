import { apiError, requireUser } from "@/lib/auth";
import { googleMailAddressForOrganization } from "@/lib/google-mail";
import { hasTwilioConnection } from "@/lib/twilio-connection-store";
import { configuredDiscordLeadWebhook } from "@/lib/discord-leads";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { listOrganizationSecrets } from "@/lib/organization-secrets";
import { isOriginalOrganization } from "@/lib/original-organization";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    await requireOrganizationCapability(user, "workflows.manage");
    const [email, smsConnected, secrets] = await Promise.all([
      googleMailAddressForOrganization(user.organizationId),
      hasTwilioConnection(user.organizationId),
      listOrganizationSecrets(user.organizationId),
    ]);
    let discordConnected = false;
    try {
      discordConnected =
        isOriginalOrganization(user.organizationId) &&
        Boolean(configuredDiscordLeadWebhook());
    } catch {
      discordConnected = false;
    }
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
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
