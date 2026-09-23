import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import {
  appInstallMessage,
  maskedPhone,
  normalizeSmsRecipient,
} from "@/lib/install-link";
import { sendTwilioSms, TwilioConnectionError } from "@/lib/twilio-client";

export const runtime = "nodejs";
export const maxDuration = 30;

const inputSchema = z.object({
  phone: z.string().trim().min(7).max(30),
});

export async function POST(request: Request) {
  let response: Response;
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(
        403,
        "Only administrators can send the company app link.",
      );
    const input = inputSchema.parse(await request.json());
    const recipient = normalizeSmsRecipient(input.phone);
    if (!recipient)
      throw new HttpError(400, "Enter a valid mobile phone number.");
    await Promise.all([
      limitAttempts(`twilio-install:user:${user.id}`, 20),
      limitAttempts(`twilio-install:recipient:${recipient}`, 3),
    ]);

    const sent = await sendTwilioSms(
      {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
      },
      { to: recipient, body: appInstallMessage },
    );

    try {
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "sms",
        entityId: randomUUID(),
        subject: `App link to ${maskedPhone(recipient)}`,
        afterData: {
          recipient: maskedPhone(recipient),
          messageSid: sent.sid,
          status: sent.status,
          sentAt: new Date().toISOString(),
        },
      });
    } catch {
      console.error("Could not record the Twilio app-link audit event.");
    }

    response = Response.json({ sent: true });
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
