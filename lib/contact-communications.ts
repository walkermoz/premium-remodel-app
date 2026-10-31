import "server-only";

import { z } from "zod";
import type { WorkspaceUser } from "./auth";
import type {
  ContactCommunication,
  ContactCommunicationChannel,
  ContactCommunicationPage,
} from "./contact-communication-types";
import { normalizeSmsRecipient } from "./install-link";
import { supabaseAdmin } from "./supabase/server";

const relatedKinds = ["lead", "quote", "agreement", "client_portal"] as const;

const communicationInput = z.object({
  organizationId: z.uuid(),
  contactId: z.uuid(),
  channel: z.enum(["email", "sms"]),
  recipient: z.string().trim().min(1).max(320),
  sender: z.string().trim().max(320).optional(),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1).max(10_000),
  relatedKind: z.enum(relatedKinds).optional(),
  relatedId: z.uuid().optional(),
  providerId: z.string().trim().max(250).optional(),
  dedupeKey: z.string().trim().min(1).max(400),
  sentAt: z.iso.datetime(),
});

function mapped(row: Record<string, unknown>): ContactCommunication {
  return {
    id: String(row.id),
    contactId: String(row.contact_id),
    channel: row.channel as ContactCommunication["channel"],
    direction: "outbound",
    status: "sent",
    recipient: String(row.recipient),
    ...(row.sender ? { sender: String(row.sender) } : {}),
    ...(row.subject ? { subject: String(row.subject) } : {}),
    body: String(row.body),
    ...(row.related_kind
      ? { relatedKind: row.related_kind as ContactCommunication["relatedKind"] }
      : {}),
    ...(row.related_id ? { relatedId: String(row.related_id) } : {}),
    ...(row.provider_id ? { providerId: String(row.provider_id) } : {}),
    sentAt: String(row.sent_at),
  };
}

export async function recordContactCommunication(
  raw: z.input<typeof communicationInput>,
) {
  const input = communicationInput.parse(raw);
  const { data: contact, error: contactError } = await supabaseAdmin()
    .from("remodel_records")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("kind", "contact")
    .eq("id", input.contactId)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact) return false;

  const { error } = await supabaseAdmin()
    .from("remodel_contact_communications")
    .upsert(
      {
        organization_id: input.organizationId,
        contact_id: input.contactId,
        channel: input.channel,
        direction: "outbound",
        status: "sent",
        recipient: input.recipient,
        sender: input.sender || null,
        subject: input.subject || null,
        body: input.body,
        related_kind: input.relatedKind || null,
        related_id: input.relatedId || null,
        provider_id: input.providerId || null,
        dedupe_key: input.dedupeKey,
        sent_at: input.sentAt,
      },
      { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true },
    );
  if (error) throw error;
  return true;
}

function matchesRecipient(
  data: Record<string, unknown>,
  channel: ContactCommunicationChannel,
  recipient: string,
) {
  if (channel === "email")
    return (
      String(data.email || "")
        .trim()
        .toLowerCase() === recipient
    );
  return normalizeSmsRecipient(String(data.phone || "")) === recipient;
}

export async function findContactIdForRecipient(input: {
  organizationId: string;
  channel: ContactCommunicationChannel;
  recipient: string;
  preferredContactId?: string;
}) {
  const recipient =
    input.channel === "email"
      ? input.recipient.trim().toLowerCase()
      : normalizeSmsRecipient(input.recipient) || "";
  if (!recipient) return null;
  const admin = supabaseAdmin();
  if (
    input.preferredContactId &&
    z.uuid().safeParse(input.preferredContactId).success
  ) {
    const { data, error } = await admin
      .from("remodel_records")
      .select("id,data")
      .eq("organization_id", input.organizationId)
      .eq("kind", "contact")
      .eq("id", input.preferredContactId)
      .maybeSingle();
    if (error) throw error;
    if (
      data &&
      matchesRecipient(
        data.data as Record<string, unknown>,
        input.channel,
        recipient,
      )
    )
      return data.id as string;
  }

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin
      .from("remodel_records")
      .select("id,data")
      .eq("organization_id", input.organizationId)
      .eq("kind", "contact")
      .range(offset, offset + 499);
    if (error) throw error;
    const match = data.find((row) =>
      matchesRecipient(
        row.data as Record<string, unknown>,
        input.channel,
        recipient,
      ),
    );
    if (match) return match.id as string;
    if (data.length < 500) return null;
  }
}

export async function listContactCommunications(
  user: WorkspaceUser,
  contactId: string,
  offset: number,
): Promise<ContactCommunicationPage> {
  const pageSize = 50;
  const { data, error } = await supabaseAdmin()
    .from("remodel_contact_communications")
    .select(
      "id,contact_id,channel,direction,status,recipient,sender,subject,body,related_kind,related_id,provider_id,sent_at",
    )
    .eq("organization_id", user.organizationId)
    .eq("contact_id", contactId)
    .order("sent_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw error;
  return {
    items: data.slice(0, pageSize).map((row) => mapped(row)),
    hasMore: data.length > pageSize,
  };
}
