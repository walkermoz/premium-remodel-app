"use client";

import {
  ArrowUpRight,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Users,
} from "lucide-react";
import {
  contactAddress,
  customerContacts,
  newestCustomerLead,
} from "@/lib/contacts";
import type { Contact, Lead, Quote } from "@/lib/types";
import { Avatar, Empty } from "./ui";

export default function CustomerContactsPanel({
  contacts,
  leads,
  quotes,
  search,
  canQuote,
  onAdd,
  onEdit,
  onQuote,
}: {
  contacts: Contact[];
  leads: Lead[];
  quotes: Quote[];
  search: string;
  canQuote: boolean;
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onQuote: (contact: Contact, lead?: Lead) => void;
}) {
  const all = customerContacts(contacts, leads);
  const matching = all
    .filter((contact) =>
      `${contact.name} ${contact.email} ${contact.phone} ${contact.address} ${contact.zip}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CUSTOMER DIRECTORY</span>
          <h1>
            Contacts<span className="heading-dot">.</span>
          </h1>
          <p>
            Customers from your leads and quotes, together with their contact
            details.
          </p>
        </div>
        <button className="button primary" onClick={onAdd}>
          <Plus size={17} /> Add customer
        </button>
      </div>
      <div className="section-intro">
        <Users size={19} />
        <h2>Customers</h2>
        <span className="count-pill">{all.length}</span>
      </div>
      <div className="customer-contact-list">
        {matching.map((contact) => {
          const lead = newestCustomerLead(contact.id, leads);
          const quoteCount = quotes.filter(
            (quote) =>
              quote.contactId === contact.id ||
              (lead && quote.leadId === lead.id),
          ).length;
          return (
            <article className="customer-contact-row" key={contact.id}>
              <Avatar name={contact.name} />
              <div className="customer-contact-main">
                <h3>{contact.name}</h3>
                <span>
                  {lead
                    ? `${lead.project} · ${lead.status}`
                    : quoteCount
                      ? `${quoteCount} ${quoteCount === 1 ? "quote" : "quotes"}`
                      : "Customer contact"}
                </span>
              </div>
              <div className="customer-contact-details">
                {contact.email && (
                  <a href={`mailto:${contact.email}`}>
                    <Mail size={14} />
                    {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>
                    <Phone size={14} />
                    {contact.phone}
                  </a>
                )}
                {contactAddress(contact) && (
                  <span>
                    <MapPin size={14} />
                    {contactAddress(contact)}
                  </span>
                )}
              </div>
              <div className="customer-contact-actions">
                {canQuote && (
                  <button
                    className="button secondary"
                    onClick={() => onQuote(contact, lead)}
                  >
                    New quote <ArrowUpRight size={14} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={`Edit ${contact.name}`}
                  onClick={() => onEdit(contact)}
                >
                  <Pencil size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!matching.length && (
        <Empty
          title={all.length ? "No matching customers" : "No customers yet"}
          text={
            all.length
              ? "Try a different name, email, phone, or address."
              : "Real leads appear here automatically. You can also add a customer directly."
          }
          action={
            <button className="button secondary" onClick={onAdd}>
              <Plus size={16} /> Add customer
            </button>
          }
        />
      )}
    </>
  );
}
