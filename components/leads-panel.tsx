"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  FilePlus2,
  Inbox,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Plus,
  UserRound,
} from "lucide-react";
import {
  leadStages,
  type Contact,
  type Lead,
  type LeadStage,
  type Quote,
} from "@/lib/types";
import { leadDisposition } from "@/lib/leads";
import { workToday } from "@/lib/work";
import { manualLeadInput, type ManualLeadInput } from "@/lib/manual-lead";
import AddressInput from "./address-input";
import { Modal } from "./ui";

type LeadFilter = "Active" | "Future" | "Archive" | "Junk";

function safeReferrerUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export default function LeadsPanel({
  leads,
  contacts,
  quotes,
  search,
  demo,
  onSaveLead,
  onCreateLead,
  onQuote,
}: {
  leads: Lead[];
  contacts: Contact[];
  quotes: Quote[];
  search: string;
  demo: boolean;
  onSaveLead: (data: Record<string, unknown>, lead: Lead) => Promise<unknown>;
  onCreateLead: (data: ManualLeadInput) => Promise<Lead>;
  onQuote: (lead: Lead, contact: Contact | null, quote?: Quote) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [scheduling, setScheduling] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [filter, setFilter] = useState<LeadFilter>("Active");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const visible = useMemo(
    () =>
      leads
        .filter((lead) => {
          const disposition = leadDisposition(lead);
          if (disposition !== filter) return false;
          const contact = contacts.find((item) => item.id === lead.contactId);
          return `${lead.name} ${lead.project} ${lead.projectDescription} ${lead.status} ${disposition} ${lead.leadAttribution?.firstTouch.source || ""} ${lead.leadAttribution?.lastTouch.source || ""} ${lead.leadAttribution?.lastTouch.referrer || ""} ${contact?.email || ""} ${contact?.phone || ""} ${contact?.address || ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());
        })
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [contacts, filter, leads, search],
  );
  const selected =
    visible.find((lead) => lead.id === selectedId) || visible[0] || null;
  const contact = selected
    ? contacts.find((item) => item.id === selected.contactId) || null
    : null;
  const linkedQuote = selected
    ? quotes.find((quote) => quote.leadId === selected.id)
    : undefined;
  const activeCount = leads.filter(
    (lead) => leadDisposition(lead) === "Active",
  ).length;

  async function patchLead(lead: Lead, patch: Record<string, unknown>) {
    setSaving(true);
    setActionError("");
    try {
      await onSaveLead(
        {
          ...lead,
          disposition: leadDisposition(lead),
          notes: lead.notes || "",
          nextAction: lead.nextAction || "",
          nextActionDue: lead.nextActionDue || "",
          draftReply: lead.draftReply || "",
          approvalState: lead.approvalState || "none",
          ...patch,
        },
        lead,
      );
      setSelectedId(lead.id);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not update this lead.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading leads-heading">
        <div>
          <span className="eyebrow">NEW BUSINESS</span>
          <h1>
            Leads<span className="heading-dot">.</span>
          </h1>
          <p>
            Track new inquiries and follow-up through quotes and projects.
          </p>
        </div>
        <div className="leads-heading-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => {
              setCreateError("");
              setCreating(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            New lead
          </button>
          <div
            className="leads-total"
            aria-label={`${activeCount} active leads`}
          >
            <Inbox size={18} aria-hidden="true" />
            <span>Active leads</span>
            <strong>{activeCount.toString().padStart(2, "0")}</strong>
          </div>
        </div>
      </div>
      {demo && <span className="sample-data-label">SAMPLE DATA</span>}
      <div className="filter-tabs lead-filters" aria-label="Filter leads">
        {(["Active", "Future", "Archive", "Junk"] as LeadFilter[]).map(
          (item) => (
            <button
              key={item}
              className={item === filter ? "active" : ""}
              aria-pressed={item === filter}
              onClick={() => setFilter(item)}
            >
              {item}
              <span>
                {item === "Active"
                  ? activeCount
                  : leads.filter((lead) => leadDisposition(lead) === item)
                      .length}
              </span>
            </button>
          ),
        )}
      </div>
      {!visible.length ? (
        <div className="empty leads-empty">
          <span className="empty-icon">
            <Inbox size={25} />
          </span>
          <h3>{search ? "No matching leads" : "No leads in this view"}</h3>
          <p>
            {search
              ? "Try another name, project, email, phone number, or address."
              : filter === "Active"
                ? "Active funnel leads appear here. Use Future, Archive, or Junk to find other leads."
                : "No leads match this disposition filter."}
          </p>
        </div>
      ) : (
        <div className="leads-layout">
          <section className="leads-list" aria-label="Leads">
            <div className="leads-list-heading">
              <span>Newest first</span>
              <strong>{visible.length}</strong>
            </div>
            {visible.map((lead) => {
              const disposition = leadDisposition(lead);
              return (
                <button
                  key={lead.id}
                  className={`lead-row ${selected?.id === lead.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(lead.id)}
                >
                  <span className="lead-row-body">
                    <span className="lead-row-top">
                      <strong>{lead.name}</strong>
                      <span className="lead-status">{lead.status}</span>
                    </span>
                    <span>{lead.project}</span>
                    <small>
                      {disposition !== "Active" ? `${disposition} · ` : ""}
                      {lead.leadAttribution?.lastTouch.source
                        ? `${lead.leadAttribution.lastTouch.source} · `
                        : ""}
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
                  <div className="lead-disposition-actions lead-header-disposition-actions">
                    {(["Future", "Archive", "Junk"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="button secondary small-button"
                        disabled={saving || leadDisposition(selected) === item}
                        onClick={() =>
                          void patchLead(selected, { disposition: item })
                        }
                      >
                        Mark {item}
                      </button>
                    ))}
                    {leadDisposition(selected) !== "Active" && (
                      <button
                        type="button"
                        className="button primary small-button"
                        disabled={saving}
                        onClick={() =>
                          void patchLead(selected, { disposition: "Active" })
                        }
                      >
                        Restore Active
                      </button>
                    )}
                  </div>
                </div>
                <div className="lead-detail-actions">
                  <time dateTime={selected.submittedAt}>
                    <CalendarClock size={14} />
                    {new Date(selected.submittedAt).toLocaleString()}
                  </time>
                  <button
                    className="button primary small-button"
                    onClick={() => onQuote(selected, contact, linkedQuote)}
                  >
                    <FilePlus2 size={15} aria-hidden="true" />
                    {linkedQuote ? "Open quote" : "Create quote"}
                  </button>
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
              <section className="lead-ops-card" aria-label="Lead lifecycle">
                <label>
                  Stage
                  <select
                    value={selected.status}
                    disabled={saving}
                    onChange={(event) =>
                      void patchLead(selected, {
                        status: event.target.value as LeadStage,
                      })
                    }
                  >
                    {leadStages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-row two">
                  <label>
                    Next action
                    <input
                      disabled={saving}
                      maxLength={250}
                      placeholder="Call homeowner, send follow-up…"
                      defaultValue={selected.nextAction || ""}
                      key={`${selected.id}-next-action-${selected.updatedAt}`}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value === (selected.nextAction || "")) return;
                        void patchLead(selected, { nextAction: value });
                      }}
                    />
                  </label>
                  <label>
                    Due
                    <input
                      type="date"
                      disabled={saving}
                      defaultValue={selected.nextActionDue || ""}
                      key={`${selected.id}-next-due-${selected.updatedAt}`}
                      onBlur={(event) => {
                        const value = event.target.value;
                        if (value === (selected.nextActionDue || "")) return;
                        void patchLead(selected, { nextActionDue: value });
                      }}
                    />
                  </label>
                </div>
                <label>
                  Notes
                  <textarea
                    rows={3}
                    maxLength={15000}
                    disabled={saving}
                    value={notesDraft[selected.id] ?? selected.notes ?? ""}
                    onChange={(event) =>
                      setNotesDraft((current) => ({
                        ...current,
                        [selected.id]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      const value = (
                        notesDraft[selected.id] ??
                        selected.notes ??
                        ""
                      ).trim();
                      if (value === (selected.notes || "")) return;
                      void patchLead(selected, { notes: value });
                    }}
                    placeholder="Operator notes, disposition context, follow-up detail."
                  />
                </label>
                {actionError && (
                  <div className="alert" role="alert">
                    {actionError}
                  </div>
                )}
                {!!selected.dispositionHistory?.length && (
                  <p className="lead-consultation-note">
                    Last disposition:{" "}
                    {
                      selected.dispositionHistory[
                        selected.dispositionHistory.length - 1
                      ].from
                    }{" "}
                    →{" "}
                    {
                      selected.dispositionHistory[
                        selected.dispositionHistory.length - 1
                      ].to
                    }{" "}
                    by{" "}
                    {
                      selected.dispositionHistory[
                        selected.dispositionHistory.length - 1
                      ].byName
                    }
                  </p>
                )}
              </section>
              {selected.projectDescription && (
                <section className="lead-project-brief">
                  <span>PROJECT REQUEST</span>
                  <p>{selected.projectDescription}</p>
                </section>
              )}
              {(selected.smsAppointmentOptIn !== undefined ||
                selected.smsMarketingOptIn !== undefined) && (
                <section className="lead-project-brief">
                  <span>TEXT PREFERENCES</span>
                  <p>
                    Appointment texts:{" "}
                    {selected.smsAppointmentOptIn === true
                      ? "Opted in"
                      : "Not opted in"}
                    <br />
                    Marketing texts:{" "}
                    {selected.smsMarketingOptIn === true
                      ? "Opted in"
                      : "Not opted in"}
                  </p>
                </section>
              )}
              {!!Object.keys(selected.otherSubmittedFields || {}).length && (
                <section className="lead-project-brief">
                  <span>OTHER SUBMITTED FIELDS</span>
                  <dl className="lead-other-fields">
                    {Object.entries(selected.otherSubmittedFields || {}).map(
                      ([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                </section>
              )}
              {selected.leadAttribution && (
                <section className="lead-project-brief">
                  <span>HOW THEY FOUND US</span>
                  <dl className="lead-other-fields">
                    {([
                      ["First visit", selected.leadAttribution.firstTouch],
                      ["Latest tracked visit", selected.leadAttribution.lastTouch],
                    ] as const).map(([label, touch]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          {touch.source}
                          {touch.medium ? ` / ${touch.medium}` : ""}
                          {touch.campaign ? ` · ${touch.campaign}` : ""}
                          {touch.landingPath ? ` · ${touch.landingPath}` : ""}
                          {touch.referrer && (
                            <>
                              <br />
                              Referrer:{" "}
                              {safeReferrerUrl(touch.referrer) ? (
                                <a
                                  href={safeReferrerUrl(touch.referrer)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {touch.referrer}
                                </a>
                              ) : (
                                touch.referrer
                              )}
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
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
                    {(contact.address || contact.zip) && (
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
                    )}
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
      {creating && (
        <Modal
          title="New lead"
          subtitle="Add the customer's contact information and the work they have in mind."
          onClose={() => {
            if (!createBusy) setCreating(false);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (createBusy) return;
              const fields = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              const data = {
                name: String(fields.name || "").trim(),
                email: String(fields.email || "").trim(),
                phone: String(fields.phone || "").trim(),
                address: String(fields.address || "").trim(),
                zip: String(fields.zip || "").trim(),
                project: String(fields.project || "").trim(),
                projectDescription: String(
                  fields.projectDescription || "",
                ).trim(),
              };
              const parsed = manualLeadInput.safeParse(data);
              if (!parsed.success) {
                setCreateError(parsed.error.issues[0].message);
                return;
              }
              setCreateBusy(true);
              setCreateError("");
              try {
                const lead = await onCreateLead(parsed.data);
                setFilter("Active");
                setSelectedId(lead.id);
                setCreating(false);
              } catch (error) {
                setCreateError(
                  error instanceof Error
                    ? error.message
                    : "Could not create this lead.",
                );
              } finally {
                setCreateBusy(false);
              }
            }}
          >
            <div className="form-fields">
              <label>
                Customer name
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={250}
                  required
                />
              </label>
              <div className="form-row two">
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={250}
                  />
                </label>
                <label>
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                  />
                </label>
              </div>
              <AddressInput label="Project address" />
              <label>
                ZIP code
                <input
                  name="zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={20}
                />
              </label>
              <label>
                Project or service
                <input
                  name="project"
                  maxLength={250}
                  placeholder="e.g. Bathroom remodel"
                  required
                />
              </label>
              <label>
                Project description
                <textarea
                  name="projectDescription"
                  rows={3}
                  maxLength={15000}
                  placeholder="What does the customer want done?"
                />
              </label>
              {createError && (
                <div className="alert" role="alert">
                  {createError}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={createBusy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={createBusy}>
                {createBusy && <LoaderCircle size={15} className="spin" />}
                {createBusy ? "Creating…" : "Create lead"}
              </button>
            </footer>
          </form>
        </Modal>
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
                    disposition: leadDisposition(scheduling),
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
