import { apiError, requireUser } from "@/lib/auth";
import { googleMailAddressForOrganization } from "@/lib/google-mail";
import { hasTwilioConnection } from "@/lib/twilio-connection-store";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    const [email, smsConnected] = await Promise.all([
      googleMailAddressForOrganization(user.organizationId),
      hasTwilioConnection(user.organizationId),
    ]);
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
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
