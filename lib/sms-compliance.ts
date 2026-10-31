import "server-only";
import { normalizeSmsRecipient } from "./install-link";
import type { SmsComplianceEventType } from "./sms-compliance-keywords";
import { classifySmsComplianceEvent } from "./sms-compliance-keywords";
import type { SmsMessageCategory } from "./sms-consent";
import { supabaseAdmin } from "./supabase/server";
import { twilioCredentialsForOrganization } from "./twilio-connection-store";
import {
  sendTwilioSms,
  readTwilioConnection,
  readRecentInboundSms,
  TwilioConnectionError,
  TwilioOptOutError,
} from "./twilio-client";

export async function applySmsComplianceEvent(input: {
  organizationId: string;
  sender: string;
  phone: string;
  eventType: SmsComplianceEventType;
  messageSid: string;
}) {
  const phone = normalizeSmsRecipient(input.phone);
  const sender = normalizeSmsRecipient(input.sender);
  if (!phone) throw new Error("Twilio sent an invalid phone number.");
  if (!sender) throw new Error("Twilio sent an invalid company number.");
  const { data, error } = await supabaseAdmin().rpc(
    "remodel_apply_sms_compliance_event",
    {
      target_organization_id: input.organizationId,
      target_sender_e164: sender,
      target_phone_e164: phone,
      target_event_type: input.eventType,
      target_message_sid: input.messageSid,
    },
  );
  if (error) throw error;
  return Boolean(data);
}

export async function isSmsDoNotDisturb(
  organizationId: string,
  sender: string,
  phone: string,
) {
  const normalizedSender = normalizeSmsRecipient(sender);
  const normalized = normalizeSmsRecipient(phone);
  if (!normalizedSender || !normalized) return false;
  const { data, error } = await supabaseAdmin()
    .from("remodel_sms_preferences")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("sender_e164", normalizedSender)
    .eq("phone_e164", normalized)
    .maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  return data?.status === "do_not_disturb";
}

export async function smsDoNotDisturbPhones(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_sms_preferences")
    .select("phone_e164")
    .eq("organization_id", organizationId)
    .eq("status", "do_not_disturb");
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw error;
  return new Set((data || []).map((item) => item.phone_e164));
}

export class SmsDoNotDisturbError extends TwilioConnectionError {}
export class SmsConsentRequiredError extends TwilioConnectionError {}

async function syncSmsComplianceForNumber(input: {
  organizationId: string;
  credentials: { accountSid?: string; authToken?: string };
  sender: string;
  phone?: string;
}) {
  const messages = await readRecentInboundSms(input.credentials, {
    to: input.sender,
    ...(input.phone ? { from: input.phone } : {}),
  });
  // Twilio returns newest first. Apply oldest first so the latest START/STOP
  // remains authoritative when history is reconciled.
  for (const message of messages.toReversed()) {
    const eventType = classifySmsComplianceEvent(message.body);
    if (eventType)
      await applySmsComplianceEvent({
        organizationId: input.organizationId,
        sender: message.to,
        phone: message.from,
        eventType,
        messageSid: message.sid,
      });
  }
}

export async function syncOrganizationSmsCompliance(organizationId: string) {
  const credentials = await twilioCredentialsForOrganization(organizationId);
  const connection = await readTwilioConnection(credentials);
  await Promise.all(
    connection.numbers
      .filter((number) => number.sms)
      .map((number) =>
        syncSmsComplianceForNumber({
          organizationId,
          credentials,
          sender: number.number,
        }),
      ),
  );
  return connection;
}

export async function sendOrganizationSms(
  organizationId: string,
  message: { to: string; body: string },
) {
  const phone = normalizeSmsRecipient(message.to);
  if (!phone)
    throw new TwilioConnectionError("Enter a valid mobile phone number.");
  const credentials = await twilioCredentialsForOrganization(organizationId);
  const connection = await readTwilioConnection(credentials);
  const sender = connection.numbers.find((number) => number.sms)?.number;
  if (!sender)
    throw new TwilioConnectionError(
      "The Twilio account does not have an SMS-capable phone number.",
    );
  await syncSmsComplianceForNumber({
    organizationId,
    credentials,
    sender,
    phone,
  });
  if (await isSmsDoNotDisturb(organizationId, sender, phone))
    throw new SmsDoNotDisturbError(
      "This contact opted out of texts from this company number. They must text START before this number can contact them again.",
    );

  try {
    return await sendTwilioSms(credentials, { ...message, to: phone });
  } catch (error) {
    if (error instanceof TwilioOptOutError) {
      await applySmsComplianceEvent({
        organizationId,
        sender,
        phone,
        eventType: "stop",
        messageSid: `rejected-${crypto.randomUUID()}`,
      });
    }
    throw error;
  }
}

export async function sendCustomerSms(
  organizationId: string,
  message: {
    contactId: string;
    to: string;
    body: string;
    category: SmsMessageCategory;
  },
) {
  const phone = normalizeSmsRecipient(message.to);
  if (!phone)
    throw new TwilioConnectionError("Enter a valid mobile phone number.");
  const admin = supabaseAdmin();
  const [contactResult, leadResult] = await Promise.all([
    admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("kind", "contact")
      .eq("id", message.contactId)
      .maybeSingle(),
    admin
      .from("remodel_records")
      .select("data")
      .eq("organization_id", organizationId)
      .eq("kind", "lead")
      .eq("data->>contactId", message.contactId),
  ]);
  if (contactResult.error) throw contactResult.error;
  if (leadResult.error) throw leadResult.error;
  const contact = contactResult.data?.data as { phone?: unknown } | undefined;
  if (
    !contact ||
    typeof contact.phone !== "string" ||
    normalizeSmsRecipient(contact.phone) !== phone
  )
    throw new TwilioConnectionError(
      "Choose the saved mobile number for this customer.",
    );
  const consentField =
    message.category === "appointment"
      ? "smsAppointmentOptIn"
      : "smsMarketingOptIn";
  const consented = (leadResult.data || []).some(
    (row) =>
      (row.data as Record<string, unknown> | null)?.[consentField] === true,
  );
  if (!consented)
    throw new SmsConsentRequiredError(
      message.category === "appointment"
        ? "This customer did not opt in to appointment and project texts."
        : "This customer did not opt in to marketing texts.",
    );
  return sendOrganizationSms(organizationId, message);
}

export async function sendWebsiteLeadSms(
  organizationId: string,
  message: { leadId: string; to: string; body: string },
) {
  const phone = normalizeSmsRecipient(message.to);
  if (!phone)
    throw new TwilioConnectionError("Enter a valid mobile phone number.");
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "lead")
    .eq("id", message.leadId)
    .maybeSingle();
  if (error) throw error;
  const lead = data?.data as Record<string, unknown> | undefined;
  const submitted = lead?.websiteSubmission as
    Record<string, unknown> | undefined;
  if (
    lead?.smsAppointmentOptIn !== true ||
    typeof submitted?.phone !== "string" ||
    normalizeSmsRecipient(submitted.phone) !== phone
  )
    throw new SmsConsentRequiredError(
      "This website lead did not opt in this phone number for appointment and project texts.",
    );
  return sendOrganizationSms(organizationId, message);
}

export async function readSmsComplianceSummary(organizationId: string) {
  const client = supabaseAdmin();
  const [preferences, events] = await Promise.all([
    client
      .from("remodel_sms_preferences")
      .select("phone_e164,status,updated_at")
      .eq("organization_id", organizationId)
      .eq("status", "do_not_disturb")
      .order("updated_at", { ascending: false })
      .limit(20),
    client
      .from("remodel_sms_compliance_events")
      .select("id,sender_e164,phone_e164,event_type,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  for (const result of [preferences, events]) {
    if (result.error && !["42P01", "PGRST205"].includes(result.error.code))
      throw result.error;
  }
  return {
    doNotDisturbCount: new Set(
      (preferences.data || []).map((preference) => preference.phone_e164),
    ).size,
    events: (events.data || []).map((event) => ({
      id: event.id,
      phone: `••• ••• ${event.phone_e164.slice(-4)}`,
      sender: event.sender_e164,
      type: event.event_type as SmsComplianceEventType,
      createdAt: event.created_at,
    })),
  };
}
