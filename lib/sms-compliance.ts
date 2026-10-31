import "server-only";
import { normalizeSmsRecipient } from "./install-link";
import type { SmsComplianceEventType } from "./sms-compliance-keywords";
import { supabaseAdmin } from "./supabase/server";
import { twilioCredentialsForOrganization } from "./twilio-connection-store";
import {
  sendTwilioSms,
  TwilioConnectionError,
  TwilioOptOutError,
} from "./twilio-client";

export async function applySmsComplianceEvent(input: {
  organizationId: string;
  phone: string;
  eventType: SmsComplianceEventType;
  messageSid: string;
}) {
  const phone = normalizeSmsRecipient(input.phone);
  if (!phone) throw new Error("Twilio sent an invalid phone number.");
  const { data, error } = await supabaseAdmin().rpc(
    "remodel_apply_sms_compliance_event",
    {
      target_organization_id: input.organizationId,
      target_phone_e164: phone,
      target_event_type: input.eventType,
      target_message_sid: input.messageSid,
    },
  );
  if (error) throw error;
  return Boolean(data);
}

export async function isSmsDoNotDisturb(organizationId: string, phone: string) {
  const normalized = normalizeSmsRecipient(phone);
  if (!normalized) return false;
  const { data, error } = await supabaseAdmin()
    .from("remodel_sms_preferences")
    .select("status")
    .eq("organization_id", organizationId)
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

export async function sendOrganizationSms(
  organizationId: string,
  message: { to: string; body: string },
) {
  const phone = normalizeSmsRecipient(message.to);
  if (!phone)
    throw new TwilioConnectionError("Enter a valid mobile phone number.");
  if (await isSmsDoNotDisturb(organizationId, phone))
    throw new SmsDoNotDisturbError(
      "This contact opted out of text messages. They must text START before the company can contact them by text again.",
    );

  try {
    return await sendTwilioSms(
      await twilioCredentialsForOrganization(organizationId),
      { ...message, to: phone },
    );
  } catch (error) {
    if (error instanceof TwilioOptOutError) {
      await applySmsComplianceEvent({
        organizationId,
        phone,
        eventType: "stop",
        messageSid: `rejected-${crypto.randomUUID()}`,
      });
    }
    throw error;
  }
}

export async function readSmsComplianceSummary(organizationId: string) {
  const client = supabaseAdmin();
  const [preferences, events] = await Promise.all([
    client
      .from("remodel_sms_preferences")
      .select("phone_e164,status,updated_at", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "do_not_disturb")
      .order("updated_at", { ascending: false })
      .limit(20),
    client
      .from("remodel_sms_compliance_events")
      .select("id,phone_e164,event_type,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  for (const result of [preferences, events]) {
    if (result.error && !["42P01", "PGRST205"].includes(result.error.code))
      throw result.error;
  }
  return {
    doNotDisturbCount: preferences.count || 0,
    events: (events.data || []).map((event) => ({
      id: event.id,
      phone: `••• ••• ${event.phone_e164.slice(-4)}`,
      type: event.event_type as SmsComplianceEventType,
      createdAt: event.created_at,
    })),
  };
}
