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
  UserRound,
} from "lucide-react";
import {
  leadApprovalStates,
  leadDispositions,
  leadStages,
  type Contact,
  type Lead,
  type LeadApprovalState,
  type LeadDisposition,
  type LeadStage,
  type Quote,
} from "@/lib/types";
import { leadDisposition } from "@/lib/leads";
import { workToday } from "@/lib/work";
import { Modal } from "./ui";

type LeadFilter = "Active" | "All" | LeadDisposition;

export default function LeadsPanel({
  leads,
  contacts,
  quotes,
  search,
  demo,
  onSaveLead,
  onQuote,
}: {
  leads: Lead[];
  contacts: Contact[];
  quotes: Quote[];
  search: string;
  demo: boolean;
  onSaveLead: (data: Record<string, unknown>, lead: Lead) => Promise<unknown>;
  onQuote: (lead: Lead, contact: Contact | null, quote?: Quote) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [scheduling, setScheduling] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filter, setFilter] = useState<LeadFilter>("Active");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const visible = useMemo(
    () =>
      leads
        .filter((lead) => {
          const disposition = leadDisposition(lead);
          if (filter === "Active") {
            if (disposition !== "Active") return false;
          } else if (filter !== "All" && disposition !== filter) return false;
          const contact = contacts.find((item) => item.id === lead.contactId);
          return `${lead.name} ${lead.project} ${lead.projectDescription} ${lead.status} ${disposition} ${contact?.email || ""} ${contact?.phone || ""} ${contact?.address || ""}`
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
      if (typeof patch.disposition === "string") {
        const next = patch.disposition as LeadDisposition;
        if (
          filter === "Active"
            ? next !== "Active"
            : filter !== "All" && filter !== next
        )
          setFilter("All");
      }
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
            Website inquiries through quote-sent. Disposition exits the funnel;
            stages track close rate.
          </p>
        </div>
        <div className="leads-total" aria-label={`${activeCount} active leads`}>
          <Inbox size={18} aria-hidden="true" />
          <span>Active leads</span>
          <strong>{activeCount.toString().padStart(2, "0")}</strong>
        </div>
      </div>
      {demo && <span className="sample-data-label">SAMPLE DATA</span>}
      <div className="filter-tabs lead-filters" aria-label="Filter leads">
        {(
          ["Active", "All", "Archive", "Junk", "Spam", "Test"] as LeadFilter[]
        ).map((item) => (
          <button
            key={item}
            className={item === filter ? "active" : ""}
            aria-pressed={item === filter}
            onClick={() => setFilter(item)}
          >
            {item}
            <span>
              {item === "All"
                ? leads.length
                : item === "Active"
                  ? activeCount
                  : leads.filter((lead) => leadDisposition(lead) === item)
                      .length}
            </span>
          </button>
        ))}
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
                ? "Active funnel leads appear here. Use All or Junk/Test to find disposed items."
                : "No leads match this disposition filter."}
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
              const disposition = leadDisposition(lead);
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
                      {disposition !== "Active" ? `${disposition} · ` : ""}
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
                <div className="form-row three">
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
                  <label>
                    Disposition
                    <select
                      value={leadDisposition(selected)}
                      disabled={saving}
                      onChange={(event) =>
                        void patchLead(selected, {
                          disposition: event.target.value as LeadDisposition,
                        })
                      }
                    >
                      {leadDispositions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Approval
                    <select
                      value={selected.approvalState || "none"}
                      disabled={saving}
                      onChange={(event) =>
                        void patchLead(selected, {
                          approvalState: event.target
                            .value as LeadApprovalState,
                        })
                      }
                    >
                      {leadApprovalStates.map((state) => (
                        <option key={state} value={state}>
                          {state === "awaiting_matthew"
                            ? "Awaiting Matthew"
                            : state === "none"
                              ? "None"
                              : state[0].toUpperCase() + state.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
                <div className="lead-disposition-actions">
                  {(["Archive", "Junk", "Spam", "Test"] as const).map(
                    (item) => (
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
                    ),
                  )}
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
                <label>
                  Draft reply
                  <textarea
                    rows={3}
                    maxLength={15000}
                    disabled={saving}
                    defaultValue={selected.draftReply || ""}
                    key={`${selected.id}-draft-${selected.updatedAt}`}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value === (selected.draftReply || "")) return;
                      void patchLead(selected, { draftReply: value });
                    }}
                    placeholder="Optional draft for Matthew approval."
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
