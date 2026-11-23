import {
  renderMessageTemplate,
  type OperatingSettings,
} from "../operating-settings";
import type { WorkflowContext } from "./schema";

export const seededLeadEmailSubject = "We received your remodel request";
export const seededLeadEmailBody =
  "Hi {{event.payload.firstName}},\n\nThanks for reaching out to {{organization.name}}. We received your remodel request and will review the details before following up about next steps.\n\nIf there is anything else we should know, you can reply directly to this email.\n\nThanks,\n{{organization.name}} Team";

/** Older unedited starter nodes follow company defaults too. Custom text and
 * an explicit Custom selection remain authoritative for that workflow. */
export function usesCompanyLeadTemplate(config: Record<string, unknown>) {
  if (config.messageTemplate)
    return config.messageTemplate === "leadAcknowledgement";
  if (config.templateKey === "website-lead-acknowledgement") return true;
  const tracking = config.resultTracking as { field?: string } | undefined;
  return (
    tracking?.field === "emailAcknowledgement" &&
    config.subject === seededLeadEmailSubject &&
    config.body === seededLeadEmailBody
  );
}

export function renderCompanyLeadTemplate(
  messages: OperatingSettings["messages"],
  context: WorkflowContext,
) {
  const payload = (context.event?.payload || {}) as Record<string, unknown>;
  const firstName = String(
    payload.firstName || context.contact?.firstName || "there",
  );
  const businessName = String(context.organization?.name || "Your team");
  const values = {
    firstName,
    clientName: String(payload.name || context.contact?.name || firstName),
    businessName,
    senderName: `${businessName} Team`,
    quoteName: "",
    quoteNumber: "",
  };
  return {
    subject: renderMessageTemplate(messages.leadSubject, values),
    body: renderMessageTemplate(messages.leadBody, values),
  };
}
