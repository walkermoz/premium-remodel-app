import { apiError, HttpError, requireUser } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import { googleMailStatus } from "@/lib/google-mail";
import { isOriginalOrganization } from "@/lib/original-organization";
import { stripeEnabledForOrganization } from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can view business setup.");
    const [config, mail] = await Promise.all([
      getBusinessConfig(user),
      googleMailStatus(user),
    ]);
    return Response.json(
      {
        organizationId: user.organizationId,
        mail: {
          configured: mail.configured,
          connected: mail.connected,
          email: mail.email,
        },
        phone: { connected: config.features.twilio },
        websiteLeads: {
          connected: isOriginalOrganization(user.organizationId),
        },
        payments: {
          stripeConnected: stripeEnabledForOrganization(user.organizationId),
          selectedProvider: config.quotePreferences.paymentProvider,
          enabled: config.features.payments,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
