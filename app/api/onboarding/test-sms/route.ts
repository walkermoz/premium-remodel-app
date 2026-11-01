import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import {
  sendOrganizationSms,
  SmsDoNotDisturbError,
} from "@/lib/sms-compliance";
import { TwilioConnectionError } from "@/lib/twilio-client";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "connections.manage");
    await limitAttempts(`onboarding-test-sms:${user.authUserId}`, 3);
    const { phone, confirmOwnNumber } = z
      .object({
        phone: z.string().trim().min(10).max(24),
        confirmOwnNumber: z.literal(true),
      })
      .strict()
      .parse(await request.json());
    if (!confirmOwnNumber)
      throw new HttpError(400, "Enter your own mobile number for a test text.");
    const config = await getBusinessConfig(user);
    const sent = await sendOrganizationSms(user.organizationId, {
      to: phone,
      body: `${config.profile.name} workspace test: your company phone connection can send texts.`,
    });
    return Response.json(
      { sentTo: sent.to },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (
      error instanceof TwilioConnectionError ||
      error instanceof SmsDoNotDisturbError
    )
      return apiError(new HttpError(409, error.message));
    return apiError(error);
  }
}
