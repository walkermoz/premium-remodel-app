"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Inbox,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import type { Contact, Lead } from "@/lib/types";
import { workToday } from "@/lib/work";
import { Modal } from "./ui";

export default function LeadsPanel({
  leads,
  contacts,
  search,
  demo,
  onSaveLead,
}: {
  leads: Lead[];
  contacts: Contact[];
  search: string;
  demo: boolean;
  onSaveLead: (data: Record<string, unknown>, lead: Lead) => Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [scheduling, setScheduling] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const visible = useMemo(
    () =>
      leads
        .filter((lead) => {
          const contact = contacts.find((item) => item.id === lead.contactId);
          return `${lead.name} ${lead.project} ${lead.projectDescription} ${contact?.email || ""} ${contact?.phone || ""} ${contact?.address || ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());
        })
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [contacts, leads, search],
  );
  const selected =
    visible.find((lead) => lead.id === selectedId) || visible[0] || null;
  const contact = selected
    ? contacts.find((item) => item.id === selected.contactId) || null
    : null;

  return (
    <>
      <div className="page-heading leads-heading">
        <div>
          <span className="eyebrow">NEW BUSINESS</span>
          <h1>
            Leads<span className="heading-dot">.</span>
          </h1>
          <p>Website inquiries and the contact details needed to follow up.</p>
        </div>
        <div className="leads-total" aria-label={`${leads.length} leads`}>
          <Inbox size={18} aria-hidden="true" />
          <span>New leads</span>
          <strong>{leads.length.toString().padStart(2, "0")}</strong>
        </div>
      </div>
      {demo && <span className="sample-data-label">SAMPLE DATA</span>}
      {!visible.length ? (
        <div className="empty leads-empty">
          <span className="empty-icon">
            <Inbox size={25} />
          </span>
          <h3>{search ? "No matching leads" : "No website leads yet"}</h3>
          <p>
            {search
              ? "Try another name, project, email, phone number, or address."
              : "New consultation requests from premiumremodel.com will appear here automatically."}
          </p>
        </div>
      ) : (
        <div className="leads-layout">
          <section className="leads-list" aria-label="Website leads">
            <div className="leads-list-heading">
              <span>Newest first</span>
              <strong>{visible.length}</strong>
            </div>
            {visible.map((lead) => {
              const leadContact = contacts.find(
                (item) => item.id === lead.contactId,
              );
              return (
                <button
                  key={lead.id}
                  className={`lead-row ${selected?.id === lead.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(lead.id)}
                >
                  <span className="lead-avatar">
                    {(leadContact?.firstName || lead.name).charAt(0)}
                  </span>
                  <span className="lead-row-body">
                    <span className="lead-row-top">
                      <strong>{lead.name}</strong>
                      <span className="lead-status">{lead.status}</span>
                    </span>
                    <span>{lead.project}</span>
                    <small>
                      {new Date(lead.submittedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                </button>
              );
            })}
          </section>
          {selected && (
            <article
              className="lead-detail"
              aria-label={`${selected.name} lead`}
            >
              <header className="lead-detail-header">
                <div>
                  <span className="lead-status">{selected.status} lead</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.project}</p>
                </div>
                <div className="lead-detail-actions">
                  <time dateTime={selected.submittedAt}>
                    <CalendarClock size={14} />
                    {new Date(selected.submittedAt).toLocaleString()}
                  </time>
                  <button
                    className="button secondary small-button"
                    onClick={() => {
                      setScheduleError("");
                      setScheduling(selected);
                    }}
                  >
                    <CalendarPlus size={15} aria-hidden="true" />
                    {selected.quoteDate
                      ? "Edit consultation"
                      : "Schedule consultation"}
                  </button>
                </div>
              </header>
              <section className="lead-project-brief">
                <span>PROJECT REQUEST</span>
                <p>{selected.projectDescription}</p>
              </section>
              {selected.quoteDate && (
                <section className="lead-quote-appointment">
                  <CalendarClock size={18} aria-hidden="true" />
                  <div>
                    <span>CONSULTATION</span>
                    <strong>
                      {new Date(
                        `${selected.quoteDate}T12:00:00`,
                      ).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                      {selected.quoteStartTime
                        ? ` at ${new Date(`2000-01-01T${selected.quoteStartTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                        : ""}
                    </strong>
                    {selected.quoteNotes && <p>{selected.quoteNotes}</p>}
                  </div>
                </section>
              )}
              <section className="lead-contact-card">
                <div className="lead-section-heading">
                  <UserRound size={17} />
                  <div>
                    <h3>Contact</h3>
                    <p>
                      Created from this {selected.source.toLowerCase()} inquiry.
                    </p>
                  </div>
                </div>
                {contact ? (
                  <dl>
                    {contact.email && (
                      <div>
                        <dt>Email</dt>
                        <dd>
                          <a href={`mailto:${contact.email}`}>
                            <Mail size={14} /> {contact.email}
                          </a>
                        </dd>
                      </div>
                    )}
                    {contact.phone && (
                      <div>
                        <dt>Phone</dt>
                        <dd>
                          <a href={`tel:${contact.phone}`}>
                            <Phone size={14} /> {contact.phone}
                          </a>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Address</dt>
                      <dd>
                        <MapPin size={14} />
                        <span>
                          {contact.address}
                          <small>{contact.zip}</small>
                        </span>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="generation-note">
                    This lead’s contact record is unavailable.
                  </p>
                )}
              </section>
              <footer className="lead-source">
                <span>Source</span>
                <strong>{selected.source}</strong>
              </footer>
            </article>
          )}
        </div>
      )}
      {scheduling && (
        <Modal
          title={
            scheduling.quoteDate ? "Edit consultation" : "Schedule consultation"
          }
          subtitle="Add the visit to Premium Remodel’s calendar. It will also sync to each connected Google Calendar."
          onClose={() => {
            if (!saving) setScheduling(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setScheduleError("");
              const form = new FormData(event.currentTarget);
              const quoteDate = String(form.get("quoteDate") || "");
              const quoteStartTime = String(form.get("quoteStartTime") || "");
              const quoteEndTime = String(form.get("quoteEndTime") || "");
              if (quoteEndTime && quoteEndTime <= quoteStartTime) {
                setScheduleError("End time must be later than start time.");
                setSaving(false);
                return;
              }
              try {
                await onSaveLead(
                  {
                    ...scheduling,
                    quoteDate,
                    quoteStartTime,
                    quoteEndTime,
                    quoteNotes: String(form.get("quoteNotes") || "").trim(),
                  },
                  scheduling,
                );
                setScheduling(null);
              } catch (error) {
                setScheduleError(
                  error instanceof Error
                    ? error.message
                    : "Could not schedule this consultation.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="form-fields lead-consultation-fields">
              <div className="form-row three">
                <label>
                  Consultation date
                  <input
                    name="quoteDate"
                    type="date"
                    min={workToday()}
                    defaultValue={scheduling.quoteDate || ""}
                    required
                  />
                </label>
                <label>
                  Start time
                  <input
                    name="quoteStartTime"
                    type="time"
                    defaultValue={scheduling.quoteStartTime || "09:00"}
                    required
                  />
                </label>
                <label>
                  End time
                  <input
                    name="quoteEndTime"
                    type="time"
                    defaultValue={scheduling.quoteEndTime || "10:00"}
                  />
                </label>
              </div>
              <label>
                Consultation notes
                <textarea
                  name="quoteNotes"
                  rows={3}
                  maxLength={1000}
                  defaultValue={scheduling.quoteNotes || ""}
                  placeholder="Access details, who will be home, or anything the estimator should know."
                />
              </label>
              <p className="lead-consultation-note">
                Times are shown in Eastern Time. Calendar changes sync
                automatically.
              </p>
              {scheduleError && (
                <div className="alert" role="alert">
                  {scheduleError}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={saving}
                onClick={() => setScheduling(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={saving}>
                {saving && <LoaderCircle size={15} className="spin" />}
                {saving ? "Saving…" : "Save consultation"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
