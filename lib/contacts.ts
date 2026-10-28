import type { Contact, Lead } from "./types";
import { leadDisposition } from "./leads";

export function isCustomerLead(lead: Lead) {
  return leadDisposition(lead) !== "Junk";
}

export function customerContacts(contacts: Contact[], leads: Lead[]) {
  const linked = new Map<string, boolean>();
  for (const lead of leads) {
    if (!lead.contactId) continue;
    linked.set(
      lead.contactId,
      Boolean(linked.get(lead.contactId)) || isCustomerLead(lead),
    );
  }
  return contacts.filter((contact) => linked.get(contact.id) !== false);
}

export function contactAddress(contact: Contact) {
  const address = contact.address.trim();
  const zip = contact.zip.trim();
  return zip && !address.includes(zip)
    ? [address, zip].filter(Boolean).join(", ")
    : address;
}

export function newestCustomerLead(contactId: string, leads: Lead[]) {
  return leads
    .filter((lead) => lead.contactId === contactId && isCustomerLead(lead))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
}
