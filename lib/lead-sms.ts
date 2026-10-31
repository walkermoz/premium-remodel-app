import "server-only";

import { getBusinessConfigForOrganization } from "./business-config";
import { websiteLeadSmsBody } from "./lead-sms-copy";
import {
  sendWebsiteLeadSms,
  SmsConsentRequiredError,
  SmsDoNotDisturbError,
} from "./sms-compliance";
import { TwilioConnectionError } from "./twilio-client";
import type { Lead } from "./types";

export type LeadSmsResult = {
  status: "sent" | "failed" | "unknown" | "not_configured" | "skipped";
  attemptedAt: string;
  twilioMessageSid?: string;
  detail?: string;
};

/** Delivery failure never rejects a successfully captured website lead. */
export async function sendWebsiteLeadSmsAcknowledgement(input: {
  organizationId: string;
  lead: Lead;
}): Promise<LeadSmsResult> {
  const attemptedAt = new Date().toISOString();
  if (input.lead.smsAppointmentOptIn !== true)
    return {
      status: "skipped",
      attemptedAt,
      detail: "Customer did not select appointment and project texts",
    };
  const phone = input.lead.websiteSubmission?.phone || "";
  if (!phone)
    return { status: "skipped", attemptedAt, detail: "No phone number" };

  try {
    const config = await getBusinessConfigForOrganization(input.organizationId);
    const sent = await sendWebsiteLeadSms(input.organizationId, {
      leadId: input.lead.id,
      to: phone,
      body: websiteLeadSmsBody(config.profile.name, input.lead.project),
    });
    return {
      status: "sent",
      attemptedAt,
      twilioMessageSid: sent.sid,
    };
  } catch (error) {
    if (
      error instanceof SmsDoNotDisturbError ||
      error instanceof SmsConsentRequiredError
    )
      return { status: "skipped", attemptedAt, detail: error.message };
    if (error instanceof TwilioConnectionError) {
      if (
        error.message === "Twilio messaging is not configured." ||
        error.message.includes("does not have an SMS-capable phone number")
      )
        return {
          status: "skipped",
          attemptedAt,
          detail: "Company texting is not connected",
        };
      if (/verification|not active/i.test(error.message))
        return {
          status: "not_configured",
          attemptedAt,
          detail: error.message,
        };
      return {
        status: "unknown",
        attemptedAt,
        detail: error.message,
      };
    }
    return {
      status: "failed",
      attemptedAt,
      detail: "Could not prepare the confirmation text",
    };
  }
}
