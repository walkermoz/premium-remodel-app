import { z } from "zod";
import type { Contact, Lead } from "./types";

const optionalText = (max: number) => z.string().trim().max(max).default("");

export const manualLeadInput = z
  .object({
    name: z.string().trim().min(1).max(250),
    email: z.union([z.email().max(250), z.literal("")]).default(""),
    phone: optionalText(30).refine(
      (value) =>
        !value ||
        (/^\+?[\d ()-]+$/.test(value) &&
          /^\d{10,15}$/.test(value.replace(/\D/g, ""))),
      "Enter a valid phone number.",
    ),
    address: optionalText(250),
    zip: optionalText(20),
    project: z.string().trim().min(1).max(250),
    projectDescription: optionalText(15000),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Enter an email address or phone number.",
  });

export type ManualLeadInput = z.input<typeof manualLeadInput>;

export function buildManualLeadRecords(
  input: ManualLeadInput,
  contactId: string,
  leadId: string,
  now: string,
): { contact: Contact; lead: Lead } {
  const data = manualLeadInput.parse(input);
  const split = data.name.indexOf(" ");
  const firstName = split < 0 ? data.name : data.name.slice(0, split);
  const lastName = split < 0 ? "" : data.name.slice(split + 1).trim();
  const digits = data.phone.replace(/\D/g, "");
  const phone = digits
    ? `+${digits.length === 10 ? `1${digits}` : digits}`
    : "";
  const contact: Contact = {
    id: contactId,
    firstName,
    lastName,
    name: data.name,
    email: data.email.toLowerCase(),
    phone,
    address: data.address,
    zip: data.zip,
    source: "Dashboard",
    createdAt: now,
    updatedAt: now,
  };
  const lead: Lead = {
    id: leadId,
    contactId,
    name: data.name,
    project: data.project,
    projectDescription: data.projectDescription,
    status: "New",
    disposition: "Active",
    smsAppointmentOptIn: false,
    smsMarketingOptIn: false,
    source: "Dashboard",
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return { contact, lead };
}
