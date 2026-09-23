"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  ClipboardPlus,
  Crosshair,
  Footprints,
  House,
  LocateFixed,
  MapPin,
  UserPlus,
} from "lucide-react";
import type { DoorVisit, Workspace } from "@/lib/types";
import { doorVisitOutcomes } from "@/lib/types";
import { workToday } from "@/lib/work";
import AddressInput from "./address-input";
import { Modal } from "./ui";

const DoorMap = dynamic(() => import("./door-knocking-map"), {
  ssr: false,
  loading: () => (
    <div className="door-map-canvas map-loading">Loading map…</div>
  ),
});

export interface DoorVisitDraft {
  address: string;
  latitude: number;
  longitude: number;
  visitedAt: string;
  outcome: DoorVisit["outcome"];
  notes: string;
  createLead: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zip: string;
  project: string;
  projectDescription: string;
  scheduleQuote: boolean;
  quoteDate: string;
  quoteStartTime: string;
  quoteEndTime: string;
  quoteNotes: string;
}

function dateTimeInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function outcomeClass(outcome: DoorVisit["outcome"]) {
  if (outcome === "Lead captured" || outcome === "Interested") return "lead";
  if (outcome === "Not interested") return "declined";
  if (outcome === "Spoke — follow up") return "follow-up";
  return "not-home";
}

export default function DoorKnockingPanel({
  workspace,
  onSave,
}: {
  workspace: Workspace;
  onSave: (data: DoorVisitDraft) => Promise<void>;
}) {
  const [marking, setMarking] = useState(false);
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [locating, setLocating] = useState(false);
  const [createLead, setCreateLead] = useState(false);
  const [outcome, setOutcome] = useState<DoorVisit["outcome"]>("Not home");
  const [scheduleQuote, setScheduleQuote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visits = useMemo(
    () =>
      [...workspace.doorVisits].sort((a, b) =>
        b.visitedAt.localeCompare(a.visitedAt),
      ),
    [workspace.doorVisits],
  );
  const today = workToday();
  const visitsToday = visits.filter(
    (visit) => dateTimeInput(new Date(visit.visitedAt)).slice(0, 10) === today,
  ).length;
  const leadsToday = visits.filter(
    (visit) =>
      visit.leadId &&
      dateTimeInput(new Date(visit.visitedAt)).slice(0, 10) === today,
  ).length;
  const quoteCount = workspace.leads.filter((lead) => lead.quoteDate).length;
  const selected = visits.find((visit) => visit.id === selectedId);

  function beginAt(next: { latitude: number; longitude: number }) {
    setPosition(next);
    setMarking(false);
    setCreateLead(false);
    setOutcome("Not home");
    setScheduleQuote(false);
    setError("");
    setShowForm(true);
  }

  return (
    <>
      <div className="page-heading door-heading">
        <div>
          <span className="eyebrow">NEIGHBORHOOD OUTREACH</span>
          <h1>
            Door knocking<span className="heading-dot">.</span>
          </h1>
          <p>
            Mark every visit, capture interested homeowners, and schedule
            consultations.
          </p>
        </div>
        <div className="door-heading-actions">
          <button
            className="button secondary"
            disabled={locating}
            onClick={() => {
              setLocating(true);
              setError("");
              navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                  setLocating(false);
                  beginAt({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  });
                },
                () => {
                  setLocating(false);
                  setError(
                    "Your location was unavailable. Tap Mark a house and choose it on the map, or add it by address.",
                  );
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
              );
            }}
          >
            <LocateFixed size={16} />
            {locating ? "Finding you…" : "Use my location"}
          </button>
          <button
            className={`button primary ${marking ? "is-active" : ""}`}
            onClick={() => setMarking((value) => !value)}
          >
            <Crosshair size={16} />
            {marking ? "Cancel marking" : "Mark a house"}
          </button>
          <button
            className="button secondary"
            onClick={() => {
              setPosition(null);
              setCreateLead(false);
              setOutcome("Not home");
              setScheduleQuote(false);
              setError("");
              setShowForm(true);
            }}
          >
            <MapPin size={16} />
            Add by address
          </button>
        </div>
      </div>
      {error && !showForm && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="door-stats" aria-label="Door-knocking totals">
        <div>
          <Footprints size={18} />
          <span>Visited today</span>
          <strong>{visitsToday}</strong>
        </div>
        <div>
          <UserPlus size={18} />
          <span>Leads today</span>
          <strong>{leadsToday}</strong>
        </div>
        <div>
          <CalendarClock size={18} />
          <span>Consultations</span>
          <strong>{quoteCount}</strong>
        </div>
      </div>
      <div className="door-workspace">
        <DoorMap
          visits={visits}
          selectedId={selectedId}
          marking={marking}
          draftPosition={position}
          onSelect={setSelectedId}
          onPick={beginAt}
        />
        <aside className="door-visit-list" aria-label="Recent house visits">
          <div className="door-list-heading">
            <div>
              <span className="eyebrow">RECENT VISITS</span>
              <h2>{visits.length} houses marked</h2>
            </div>
          </div>
          {!visits.length && (
            <div className="door-empty">
              <House size={26} />
              <h3>No visits marked yet</h3>
              <p>Use your location or tap a house on the map to get started.</p>
            </div>
          )}
          {visits.slice(0, 30).map((visit) => (
            <button
              key={visit.id}
              className={`door-visit-row ${selectedId === visit.id ? "selected" : ""}`}
              onClick={() => setSelectedId(visit.id)}
            >
              <span
                className={`door-outcome-dot ${outcomeClass(visit.outcome)}`}
              />
              <span>
                <strong>{visit.address}</strong>
                <small>
                  {visit.outcome} · {new Date(visit.visitedAt).toLocaleString()}
                </small>
                <small>By {visit.canvasserName}</small>
              </span>
              {visit.leadId && <span className="door-lead-pill">Lead</span>}
            </button>
          ))}
          {selected?.notes && (
            <div className="door-selected-note">
              <strong>Visit note</strong>
              <p>{selected.notes}</p>
            </div>
          )}
        </aside>
      </div>
      <div className="door-map-legend" aria-label="Map legend">
        <span>
          <i className="lead" /> Interested / lead
        </span>
        <span>
          <i className="follow-up" /> Follow up
        </span>
        <span>
          <i className="not-home" /> Not home
        </span>
        <span>
          <i className="declined" /> Not interested
        </span>
      </div>

      {showForm && (
        <Modal
          title="Mark this house"
          subtitle="Save the visit first. Add a lead and consultation when the homeowner is interested."
          onClose={() => !busy && setShowForm(false)}
        >
          <form
            className="entity-form door-visit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setBusy(true);
              setError("");
              try {
                if (!position)
                  throw new Error(
                    "Choose an address suggestion so the house can be placed on the map, or start again with Use my location.",
                  );
                await onSave({
                  address: String(form.get("address") || ""),
                  ...position,
                  visitedAt: new Date(
                    String(form.get("visitedAt")),
                  ).toISOString(),
                  outcome: String(form.get("outcome")) as DoorVisit["outcome"],
                  notes: String(form.get("notes") || ""),
                  createLead,
                  firstName: String(form.get("firstName") || ""),
                  lastName: String(form.get("lastName") || ""),
                  email: String(form.get("email") || ""),
                  phone: String(form.get("phone") || ""),
                  zip: String(form.get("zip") || ""),
                  project: String(form.get("project") || ""),
                  projectDescription: String(
                    form.get("projectDescription") || "",
                  ),
                  scheduleQuote,
                  quoteDate: String(form.get("quoteDate") || ""),
                  quoteStartTime: String(form.get("quoteStartTime") || ""),
                  quoteEndTime: String(form.get("quoteEndTime") || ""),
                  quoteNotes: String(form.get("quoteNotes") || ""),
                });
                setShowForm(false);
                setPosition(null);
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not save this visit.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-fields">
              <AddressInput
                label="House address"
                onSuggestion={(suggestion) => {
                  if (
                    suggestion.latitude !== undefined &&
                    suggestion.longitude !== undefined
                  )
                    setPosition({
                      latitude: suggestion.latitude,
                      longitude: suggestion.longitude,
                    });
                }}
              />
              <div className="form-row">
                <label>
                  Visit time
                  <input
                    type="datetime-local"
                    name="visitedAt"
                    max={dateTimeInput()}
                    defaultValue={dateTimeInput()}
                    required
                  />
                </label>
                <label>
                  Result
                  <select
                    name="outcome"
                    value={outcome}
                    onChange={(event) =>
                      setOutcome(event.target.value as DoorVisit["outcome"])
                    }
                  >
                    {doorVisitOutcomes.map((outcome) => (
                      <option key={outcome}>{outcome}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Visit notes
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={4000}
                  placeholder="Gate code, best time to return, homeowner request…"
                />
              </label>
              <label className="door-check-card">
                <input
                  type="checkbox"
                  checked={createLead}
                  onChange={(event) => {
                    setCreateLead(event.target.checked);
                    if (event.target.checked) setOutcome("Lead captured");
                    if (!event.target.checked) setScheduleQuote(false);
                  }}
                />
                <span>
                  <strong>Create a lead</strong>
                  <small>
                    Save the homeowner and project request in Leads.
                  </small>
                </span>
              </label>
              {createLead && (
                <div className="door-lead-fields">
                  <div className="form-row">
                    <label>
                      First name
                      <input name="firstName" maxLength={100} required />
                    </label>
                    <label>
                      Last name
                      <input name="lastName" maxLength={100} />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Phone
                      <input name="phone" type="tel" autoComplete="tel" />
                    </label>
                    <label>
                      Email
                      <input name="email" type="email" autoComplete="email" />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      ZIP code
                      <input name="zip" inputMode="numeric" maxLength={10} />
                    </label>
                    <label>
                      Interested in
                      <select name="project" defaultValue="" required>
                        <option value="" disabled>
                          Select work type
                        </option>
                        {[
                          "Bathroom",
                          "Kitchen",
                          "Deck",
                          "Basement",
                          "Roofing",
                          "Siding",
                          "Windows",
                          "Addition",
                          "Other",
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Project request
                    <textarea
                      name="projectDescription"
                      rows={3}
                      minLength={10}
                      maxLength={1000}
                      required
                      placeholder="What work are they considering?"
                    />
                  </label>
                  <label className="door-check-card">
                    <input
                      type="checkbox"
                      checked={scheduleQuote}
                      onChange={(event) =>
                        setScheduleQuote(event.target.checked)
                      }
                    />
                    <span>
                      <strong>Schedule consultation</strong>
                      <small>Add it to the company calendar.</small>
                    </span>
                  </label>
                  {scheduleQuote && (
                    <div className="door-quote-fields">
                      <div className="form-row three">
                        <label>
                          Date
                          <input
                            name="quoteDate"
                            type="date"
                            min={today}
                            required
                          />
                        </label>
                        <label>
                          Start
                          <input name="quoteStartTime" type="time" required />
                        </label>
                        <label>
                          End
                          <input name="quoteEndTime" type="time" />
                        </label>
                      </div>
                      <label>
                        Consultation notes
                        <textarea
                          name="quoteNotes"
                          rows={2}
                          maxLength={1000}
                          placeholder="Who will be home, access details, requested estimator…"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}
              {position && (
                <p className="door-position-ready">
                  <Check size={14} /> Map location ready
                </p>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                <ClipboardPlus size={16} />
                {busy
                  ? "Saving…"
                  : createLead
                    ? "Save visit & lead"
                    : "Save visit"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
