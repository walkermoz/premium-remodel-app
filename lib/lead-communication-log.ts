import "server-only";

import { getBusinessConfigForOrganization } from "./business-config";
import { recordContactCommunication } from "./contact-communications";
import { renderLeadAcknowledgement } from "./email-template";
import type { LeadEmailResult } from "./lead-email";
import { websiteLeadSmsBody } from "./lead-sms-copy";
import type { LeadSmsResult } from "./lead-sms";
import type { Lead } from "./types";

export async function recordWebsiteLeadDeliveries(input: {
  organizationId: string;
  lead: Lead;
  email?: LeadEmailResult;
  sms?: LeadSmsResult;
  emailRecipient?: string;
  smsRecipient?: string;
}) {
  const tasks: Promise<unknown>[] = [];
  const submitted = input.lead.websiteSubmission;
  const emailRecipient = input.emailRecipient || submitted?.email || "";
  const smsRecipient = input.smsRecipient || submitted?.phone || "";
  if (input.email?.status === "sent" && emailRecipient) {
    const firstName = (submitted?.name || input.lead.name)
      .trim()
      .split(/\s+/)[0];
    tasks.push(
      recordContactCommunication({
        organizationId: input.organizationId,
        contactId: input.lead.contactId,
        channel: "email",
        recipient: emailRecipient.toLowerCase(),
        subject: "We received your remodel request",
        body: renderLeadAcknowledgement({ firstName }).text,
        relatedKind: "lead",
        relatedId: input.lead.id,
        providerId: input.email.googleMessageId,
        dedupeKey: input.email.googleMessageId
          ? `gmail:${input.email.googleMessageId}`
          : `lead-email:${input.lead.id}:${input.email.attemptedAt}`,
        sentAt: input.email.attemptedAt,
      }),
    );
  }
  if (input.sms?.status === "sent" && smsRecipient) {
    tasks.push(
      (async () => {
        const business = await getBusinessConfigForOrganization(
          input.organizationId,
        );
        return recordContactCommunication({
          organizationId: input.organizationId,
          contactId: input.lead.contactId,
          channel: "sms",
          recipient: smsRecipient,
          body: websiteLeadSmsBody(business.profile.name, input.lead.project),
          relatedKind: "lead",
          relatedId: input.lead.id,
          providerId: input.sms?.twilioMessageSid,
          dedupeKey: input.sms?.twilioMessageSid
            ? `twilio:${input.sms.twilioMessageSid}`
            : `lead-sms:${input.lead.id}:${input.sms?.attemptedAt}`,
          sentAt: input.sms!.attemptedAt,
        });
      })(),
    );
  }
  const results = await Promise.allSettled(tasks);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}
