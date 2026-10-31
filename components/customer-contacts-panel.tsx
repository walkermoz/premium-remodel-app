"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Ban,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Send,
  Users,
} from "lucide-react";
import {
  contactAddress,
  customerContacts,
  newestCustomerLead,
} from "@/lib/contacts";
import type { Contact, Lead, Quote } from "@/lib/types";
import type {
  ContactCommunication,
  ContactCommunicationChannel,
  ContactCommunicationPage,
} from "@/lib/contact-communication-types";
import { Avatar, Empty, Modal } from "./ui";

function communicationTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function demoCommunications(contact: Contact): ContactCommunication[] {
  const now = Date.now();
  return [
    {
      id: "demo-communication-sms",
      contactId: contact.id,
      channel: "sms",
      direction: "outbound",
      status: "sent",
      recipient: contact.phone,
      body: "Premium Remodel: We received your Kitchen Remodel request. A member of our team will be in touch soon to schedule a visit. STOP to opt out; HELP for help.",
      relatedKind: "lead",
      sentAt: new Date(now - 42 * 60_000).toISOString(),
    },
    {
      id: "demo-communication-email",
      contactId: contact.id,
      channel: "email",
      direction: "outbound",
      status: "sent",
      recipient: contact.email,
      subject: "We received your remodel request",
      body: "Thanks for reaching out to Premium Remodel. We received your remodel request and will review the details before following up about next steps.",
      relatedKind: "lead",
      sentAt: new Date(now - 45 * 60_000).toISOString(),
    },
  ];
}

export default function CustomerContactsPanel({
  contacts,
  leads,
  quotes,
  search,
  canQuote,
  demo = false,
  onAdd,
  onEdit,
  onQuote,
}: {
  contacts: Contact[];
  leads: Lead[];
  quotes: Quote[];
  search: string;
  canQuote: boolean;
  demo?: boolean;
  onAdd: () => void;
  onEdit: (contact: Contact) => void;
  onQuote: (contact: Contact, lead?: Lead) => void;
}) {
  const [selected, setSelected] = useState<Contact | null>(null);
  const [communications, setCommunications] = useState<ContactCommunication[]>(
    [],
  );
  const [communicationFilter, setCommunicationFilter] = useState<
    "all" | ContactCommunicationChannel
  >("all");
  const [communicationsLoading, setCommunicationsLoading] = useState(false);
  const [communicationsError, setCommunicationsError] = useState("");
  const [hasMoreCommunications, setHasMoreCommunications] = useState(false);
  const all = customerContacts(contacts, leads);
  const matching = all
    .filter((contact) =>
      `${contact.name} ${contact.email} ${contact.phone} ${contact.address} ${contact.zip}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  async function loadCommunications(
    contact: Contact,
    offset = 0,
    append = false,
  ) {
    setCommunicationsLoading(true);
    setCommunicationsError("");
    try {
      if (demo) {
        setCommunications(demoCommunications(contact));
        setHasMoreCommunications(false);
        return;
      }
      const response = await fetch(
        `/api/contacts/${contact.id}/communications?offset=${offset}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as ContactCommunicationPage & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Communication history could not load.");
      setCommunications((current) =>
        append ? [...current, ...data.items] : data.items,
      );
      setHasMoreCommunications(data.hasMore);
    } catch (error) {
      setCommunicationsError(
        error instanceof Error
          ? error.message
          : "Communication history could not load.",
      );
    } finally {
      setCommunicationsLoading(false);
    }
  }

  function openContact(contact: Contact) {
    setSelected(contact);
    setCommunicationFilter("all");
    setCommunications([]);
    void loadCommunications(contact);
  }

  const visibleCommunications = communications.filter(
    (item) =>
      communicationFilter === "all" || item.channel === communicationFilter,
  );

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
                <div className="customer-contact-name">
                  <h3>
                    <button
                      type="button"
                      className="customer-contact-open"
                      onClick={() => openContact(contact)}
                    >
                      {contact.name}
                    </button>
                  </h3>
                  {contact.smsDoNotDisturb && (
                    <span
                      className="customer-contact-dnd"
                      title="Texting blocked"
                    >
                      <Ban size={11} /> Do Not Disturb
                    </span>
                  )}
                </div>
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
                  className="button secondary customer-contact-history"
                  onClick={() => openContact(contact)}
                >
                  <MessageSquareText size={14} /> History
                </button>
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
      {selected && (
        <Modal
          title={selected.name}
          subtitle="Customer contact and communication history"
          onClose={() => setSelected(null)}
        >
          <div className="contact-detail">
            <div className="contact-detail-summary">
              <Avatar name={selected.name} />
              <div>
                {selected.email && (
                  <a href={`mailto:${selected.email}`}>
                    <Mail size={14} /> {selected.email}
                  </a>
                )}
                {selected.phone && (
                  <a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>
                    <Phone size={14} /> {selected.phone}
                  </a>
                )}
                {contactAddress(selected) && (
                  <span>
                    <MapPin size={14} /> {contactAddress(selected)}
                  </span>
                )}
              </div>
              <div className="contact-detail-actions">
                {canQuote && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSelected(null);
                      onQuote(selected, newestCustomerLead(selected.id, leads));
                    }}
                  >
                    New quote <ArrowUpRight size={14} />
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => {
                    setSelected(null);
                    onEdit(selected);
                  }}
                >
                  <Pencil size={14} /> Edit
                </button>
              </div>
            </div>

            <section className="contact-communications">
              <div className="contact-communications-heading">
                <div>
                  <span className="eyebrow">COMMUNICATIONS</span>
                  <h3>History</h3>
                </div>
                <div
                  className="contact-communication-filters"
                  aria-label="Communication channel"
                >
                  {(["all", "email", "sms"] as const).map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      className={
                        communicationFilter === channel ? "active" : ""
                      }
                      aria-pressed={communicationFilter === channel}
                      onClick={() => setCommunicationFilter(channel)}
                    >
                      {channel === "all"
                        ? "All"
                        : channel === "email"
                          ? "Email"
                          : "Text"}
                    </button>
                  ))}
                </div>
              </div>

              {communicationsLoading && !communications.length && (
                <div className="contact-communication-state">
                  <LoaderCircle className="spin" size={18} /> Loading history…
                </div>
              )}
              {communicationsError && (
                <div
                  className="contact-communication-state is-error"
                  role="alert"
                >
                  {communicationsError}
                  <button
                    className="button secondary"
                    onClick={() => void loadCommunications(selected)}
                  >
                    Try again
                  </button>
                </div>
              )}
              {!communicationsLoading &&
                !communicationsError &&
                !visibleCommunications.length && (
                  <div className="contact-communication-empty">
                    <MessageSquareText size={21} />
                    <strong>
                      {communications.length
                        ? `No ${communicationFilter === "sms" ? "texts" : "emails"} yet`
                        : "No communications yet"}
                    </strong>
                    <span>
                      Sent quote emails, agreement emails, portal links, and
                      confirmation texts will appear here.
                    </span>
                  </div>
                )}
              <div className="contact-communication-timeline">
                {visibleCommunications.map((item) => (
                  <article
                    key={item.id}
                    className="contact-communication-entry"
                  >
                    <span
                      className={`contact-communication-icon is-${item.channel}`}
                    >
                      {item.channel === "email" ? (
                        <Mail size={15} />
                      ) : (
                        <MessageSquareText size={15} />
                      )}
                    </span>
                    <div>
                      <div className="contact-communication-meta">
                        <strong>
                          {item.channel === "email"
                            ? "Email sent"
                            : "Text sent"}
                        </strong>
                        <span>
                          <Send size={11} /> Sent
                        </span>
                        <time dateTime={item.sentAt}>
                          <Clock3 size={11} /> {communicationTime(item.sentAt)}
                        </time>
                      </div>
                      {item.subject && <h4>{item.subject}</h4>}
                      <p>{item.body}</p>
                      <small>To {item.recipient}</small>
                    </div>
                  </article>
                ))}
              </div>
              {hasMoreCommunications && communicationFilter === "all" && (
                <button
                  className="contact-communications-more"
                  disabled={communicationsLoading}
                  onClick={() =>
                    void loadCommunications(
                      selected,
                      communications.length,
                      true,
                    )
                  }
                >
                  {communicationsLoading ? "Loading…" : "Load older"}
                  <ChevronDown size={14} />
                </button>
              )}
            </section>
          </div>
        </Modal>
      )}
    </>
  );
}
