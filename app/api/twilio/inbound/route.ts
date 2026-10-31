import { validateRequest } from "twilio/lib/webhooks/webhooks";
import { z } from "zod";
import { appOrigin } from "@/lib/auth";
import { applySmsComplianceEvent } from "@/lib/sms-compliance";
import { classifySmsComplianceEvent } from "@/lib/sms-compliance-keywords";
import {
  organizationForTwilioAccount,
  twilioCredentialsForOrganization,
} from "@/lib/twilio-connection-store";

export const runtime = "nodejs";
export const maxDuration = 15;

const webhookSchema = z.object({
  AccountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  MessageSid: z.string().regex(/^(?:SM|MM)[0-9a-f]{32}$/i),
  From: z.string().regex(/^\+[1-9]\d{7,14}$/),
  To: z.string().regex(/^\+[1-9]\d{7,14}$/),
  Body: z.string().max(1600).default(""),
  OptOutType: z.string().max(16).optional(),
});

function twimlResponse(status = 200) {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    {
      status,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const entries = Array.from(new URLSearchParams(rawBody).entries());
    const params = Object.fromEntries(entries);
    const input = webhookSchema.parse(params);
    const organizationId = await organizationForTwilioAccount(input.AccountSid);
    if (!organizationId) return twimlResponse(403);

    const credentials = await twilioCredentialsForOrganization(organizationId);
    if (credentials.accountSid !== input.AccountSid || !credentials.authToken)
      return twimlResponse(403);

    const signature = request.headers.get("x-twilio-signature") || "";
    const webhookUrl = `${appOrigin(request)}/api/twilio/inbound`;
    if (!validateRequest(credentials.authToken, signature, webhookUrl, params))
      return twimlResponse(403);

    const eventType = classifySmsComplianceEvent(input.Body, input.OptOutType);
    if (eventType)
      await applySmsComplianceEvent({
        organizationId,
        sender: input.To,
        phone: input.From,
        eventType,
        messageSid: input.MessageSid,
      });

    // Twilio sends the HELP/STOP/START acknowledgement. Returning empty TwiML
    // avoids sending a duplicate message while still recording the event.
    return twimlResponse();
  } catch (error) {
    console.error("Inbound Twilio webhook failed.", error);
    return twimlResponse(error instanceof z.ZodError ? 400 : 500);
  }
}
