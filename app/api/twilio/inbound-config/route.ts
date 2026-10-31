import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { twilioCredentialsForOrganization } from "@/lib/twilio-connection-store";
import {
  configureTwilioInboundSms,
  TwilioConnectionError,
} from "@/lib/twilio-client";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let response: Response;
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Automation");
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can manage phone automation.",
      );
    await limitAttempts(`twilio-inbound-config:${user.id}`, 10);
    const credentials = await twilioCredentialsForOrganization(
      user.organizationId,
    );
    const connection = await configureTwilioInboundSms(
      credentials,
      `${appOrigin(request)}/api/twilio/inbound`,
    );
    try {
      await recordAuditEvent(user, {
        action: "updated",
        entityKind: "integration",
        entityId: user.organizationId,
        subject: "Inbound SMS automation",
        afterData: {
          phoneNumbers: connection.numbers
            .filter((number) => number.sms)
            .map((number) => number.number),
        },
      });
    } catch {
      console.error("Could not record the inbound SMS automation audit event.");
    }
    response = Response.json(connection);
  } catch (error) {
    response = apiError(
      error instanceof TwilioConnectionError
        ? new HttpError(503, error.message)
        : error,
    );
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
