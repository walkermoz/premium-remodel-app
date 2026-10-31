import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { isOriginalOrganization } from "@/lib/original-organization";
import { recordAuditEvent } from "@/lib/audit-server";
import { z } from "zod";
import {
  deleteTwilioConnection,
  saveTwilioConnection,
  twilioCredentialsForOrganization,
} from "@/lib/twilio-connection-store";
import {
  configureTwilioInboundSms,
  readTwilioConnection,
  TwilioConnectionError,
} from "@/lib/twilio-client";

export const runtime = "nodejs";
export const maxDuration = 30;

const connectionInput = z.object({
  accountSid: z
    .string()
    .trim()
    .regex(/^AC[0-9a-f]{32}$/i),
  authToken: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/i),
});

function requireAdmin(role: string) {
  if (role !== "admin")
    throw new HttpError(
      403,
      "Only administrators can manage the Twilio connection.",
    );
}

export async function GET() {
  let response: Response;
  try {
    const user = await requireUser();
    requireAdmin(user.role);
    await limitAttempts(`twilio-config:${user.id}`, 60);
    response = Response.json({
      ...(await readTwilioConnection(
        await twilioCredentialsForOrganization(user.organizationId),
      )),
      ...(isOriginalOrganization(user.organizationId)
        ? { managedByPlatform: true }
        : {}),
    });
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

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireAdmin(user.role);
    if (isOriginalOrganization(user.organizationId))
      throw new HttpError(
        403,
        "This phone account is managed by the platform.",
      );
    await limitAttempts(`twilio-connect:${user.id}`, 10);
    const credentials = connectionInput.parse(await request.json());
    const verifiedConnection = await readTwilioConnection(credentials);
    if (
      !verifiedConnection.account ||
      verifiedConnection.account.sid !== credentials.accountSid
    )
      throw new HttpError(400, "Twilio did not verify this account.");
    const connection = await configureTwilioInboundSms(
      credentials,
      `${appOrigin(request)}/api/twilio/inbound`,
    );
    await saveTwilioConnection(user.organizationId, user.id, credentials);
    try {
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "integration",
        entityId: user.organizationId,
        subject: "Twilio connection",
        afterData: { accountSid: credentials.accountSid },
      });
    } catch {
      console.error("Could not record the Twilio connection audit event.");
    }
    return Response.json(connection, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(
      error instanceof TwilioConnectionError
        ? new HttpError(400, error.message)
        : error,
    );
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireAdmin(user.role);
    if (isOriginalOrganization(user.organizationId))
      throw new HttpError(
        403,
        "This phone account is managed by the platform.",
      );
    await deleteTwilioConnection(user.organizationId);
    try {
      await recordAuditEvent(user, {
        action: "deleted",
        entityKind: "integration",
        entityId: user.organizationId,
        subject: "Twilio connection",
      });
    } catch {
      console.error("Could not record the Twilio disconnection audit event.");
    }
    return Response.json(await readTwilioConnection({}), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
