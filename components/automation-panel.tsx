"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  BellRing,
  Check,
  CircleDot,
  Clock3,
  GitBranch,
  Inbox,
  MailCheck,
  RefreshCw,
  Save,
  UserRoundSearch,
  UsersRound,
  Workflow,
} from "lucide-react";
import {
  defaultWebsiteLeadAutomation,
  websiteLeadDispositions,
  websiteLeadStages,
  type WebsiteLeadAutomation,
} from "@/lib/automation-config";
import type { Lead, User } from "@/lib/types";

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="automation-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </label>
  );
}

function FlowConnector({ branch = false }: { branch?: boolean }) {
  return (
    <div className={`automation-connector ${branch ? "is-branch" : ""}`}>
      {branch ? <GitBranch size={15} /> : <ArrowDown size={15} />}
    </div>
  );
}

export default function AutomationPanel({
  user,
  leads,
  demo,
}: {
  user: User;
  leads: Lead[];
  demo: boolean;
}) {
  const [automation, setAutomation] = useState<WebsiteLeadAutomation>(
    defaultWebsiteLeadAutomation(),
  );
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [openedAt] = useState(() => Date.now());
  const editable = !demo && user.role === "admin";

  useEffect(() => {
    if (demo) return;
    let active = true;
    void fetch("/api/automations/website-leads", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load this automation.");
        if (active) setAutomation(data);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load this automation.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);

  const executions = useMemo(
    () =>
      leads
        .filter(
          (lead) =>
            lead.emailAcknowledgement ||
            /website|web form/i.test(lead.source || ""),
        )
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [leads],
  );
  const recentCount = executions.filter(
    (lead) => Date.parse(lead.submittedAt) >= openedAt - 30 * 86_400_000,
  ).length;

  function update(patch: Partial<WebsiteLeadAutomation>) {
    setAutomation((current) => ({ ...current, ...patch }));
    setDirty(true);
    setMessage("");
    setError("");
  }

  async function save() {
    if (!editable || !dirty) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/automations/website-leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(automation),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save this automation.");
      setAutomation(data);
      setDirty(false);
      setMessage("Automation saved");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save this automation.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="automation-page">
      <div className="page-heading automation-heading">
        <div>
          <span className="eyebrow">CONNECTED WORKFLOWS</span>
          <h1>
            Automation<span className="heading-dot">.</span>
          </h1>
          <p>
            See what happens when a new inquiry arrives and configure how it
            becomes a customer and lead.
          </p>
        </div>
        <div className="automation-heading-actions">
          <span className="automation-active-badge">
            <span /> Active
          </span>
          {editable && (
            <button
              className="button primary"
              type="button"
              disabled={!dirty || saving || loading}
              onClick={() => void save()}
            >
              {saving ? (
                <RefreshCw className="spin" size={16} />
              ) : (
                <Save size={16} />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success" role="status">
          <Check size={16} /> {message}
        </div>
      )}
      {!editable && !demo && (
        <div className="automation-readonly-note">
          You can review this workflow. An administrator can change its steps.
        </div>
      )}

      <div className="automation-layout">
        <aside className="automation-library" aria-label="Automations">
          <div className="automation-library-heading">
            <div>
              <span>Workflows</span>
              <strong>1</strong>
            </div>
            <p>Published workflows run as soon as their trigger occurs.</p>
          </div>
          <button className="automation-list-item is-selected" type="button">
            <span className="automation-list-icon">
              <Workflow size={18} />
            </span>
            <span>
              <strong>{automation.name}</strong>
              <small>Website form → Leads</small>
            </span>
            <CircleDot size={14} />
          </button>
          <div className="automation-library-summary">
            <span>Last 30 days</span>
            <strong>{recentCount}</strong>
            <small>
              {recentCount === 1 ? "lead captured" : "leads captured"}
            </small>
          </div>
        </aside>

        <main className="automation-builder" aria-busy={loading}>
          <div className="automation-builder-title">
            <div>
              <span>WORKFLOW</span>
              <input
                aria-label="Workflow name"
                value={automation.name}
                disabled={!editable}
                maxLength={120}
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>
            <span className="automation-version">Published</span>
          </div>

          {loading ? (
            <div className="automation-loading">
              <RefreshCw className="spin" size={21} />
              Loading workflow…
            </div>
          ) : (
            <div className="automation-flow">
              <article className="automation-node is-trigger">
                <div className="automation-node-icon">
                  <Inbox size={19} />
                </div>
                <div className="automation-node-copy">
                  <span className="automation-node-kind">TRIGGER</span>
                  <h2>Website form submitted</h2>
                  <p>
                    Starts when a customer sends a project inquiry from the
                    connected company website.
                  </p>
                  <div className="automation-node-meta">
                    <span>Form submission</span>
                    <span>Runs immediately</span>
                  </div>
                </div>
              </article>

              <FlowConnector />

              <article className="automation-node">
                <div className="automation-node-icon is-contact">
                  <UserRoundSearch size={19} />
                </div>
                <div className="automation-node-copy">
                  <span className="automation-node-kind">ACTION 1</span>
                  <h2>Find or create customer</h2>
                  <p>
                    Saves the submitted person as a customer contact before the
                    sales opportunity is created.
                  </p>
                  <div
                    className="automation-field-map"
                    aria-label="Contact field mapping"
                  >
                    {[
                      "Name → Customer name",
                      "Email → Email",
                      "Phone → Phone",
                      "Address → Address",
                    ].map((field) => (
                      <span key={field}>{field}</span>
                    ))}
                  </div>
                  <Toggle
                    checked={automation.matchExistingContacts}
                    disabled={!editable}
                    label="Reuse a customer when email or phone matches"
                    onChange={(matchExistingContacts) =>
                      update({ matchExistingContacts })
                    }
                  />
                </div>
              </article>

              <FlowConnector />

              <article className="automation-node">
                <div className="automation-node-icon is-lead">
                  <UsersRound size={19} />
                </div>
                <div className="automation-node-copy">
                  <span className="automation-node-kind">ACTION 2</span>
                  <h2>Create lead</h2>
                  <p>
                    Links the project request to the customer and places it in
                    the lead pipeline with these defaults.
                  </p>
                  <div className="automation-config-grid">
                    <label>
                      <span>Lead source</span>
                      <input
                        value={automation.sourceLabel}
                        disabled={!editable}
                        maxLength={120}
                        onChange={(event) =>
                          update({ sourceLabel: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>Starting stage</span>
                      <select
                        value={automation.initialStage}
                        disabled={!editable}
                        onChange={(event) =>
                          update({
                            initialStage: event.target
                              .value as WebsiteLeadAutomation["initialStage"],
                          })
                        }
                      >
                        {websiteLeadStages.map((stage) => (
                          <option key={stage}>{stage}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Lead list</span>
                      <select
                        value={automation.initialDisposition}
                        disabled={!editable}
                        onChange={(event) =>
                          update({
                            initialDisposition: event.target
                              .value as WebsiteLeadAutomation["initialDisposition"],
                          })
                        }
                      >
                        {websiteLeadDispositions.map((disposition) => (
                          <option key={disposition}>{disposition}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div
                    className="automation-field-map"
                    aria-label="Lead field mapping"
                  >
                    <span>Project type → Project</span>
                    <span>Project details → Description</span>
                    <span>Customer → Linked contact</span>
                  </div>
                </div>
              </article>

              <FlowConnector branch />

              <div className="automation-branch-grid">
                <article className="automation-node is-compact">
                  <div className="automation-node-icon is-email">
                    <MailCheck size={18} />
                  </div>
                  <div className="automation-node-copy">
                    <span className="automation-node-kind">CUSTOMER</span>
                    <h2>Send confirmation email</h2>
                    <p>
                      Runs when the submitted customer has an email address.
                    </p>
                    <Toggle
                      checked={automation.sendAcknowledgement}
                      disabled={!editable}
                      label="Send automatically"
                      onChange={(sendAcknowledgement) =>
                        update({ sendAcknowledgement })
                      }
                    />
                  </div>
                </article>
                <article className="automation-node is-compact">
                  <div className="automation-node-icon is-notification">
                    <BellRing size={18} />
                  </div>
                  <div className="automation-node-copy">
                    <span className="automation-node-kind">TEAM</span>
                    <h2>Notify the team</h2>
                    <p>
                      Sends the connected team channel the new lead details.
                    </p>
                    <Toggle
                      checked={automation.sendTeamNotification}
                      disabled={!editable}
                      label="Notify automatically"
                      onChange={(sendTeamNotification) =>
                        update({ sendTeamNotification })
                      }
                    />
                  </div>
                </article>
              </div>
            </div>
          )}
        </main>

        <aside className="automation-runs" aria-label="Recent workflow runs">
          <div className="automation-runs-heading">
            <div>
              <Clock3 size={17} />
              <strong>Recent runs</strong>
            </div>
            <span>{executions.length} total</span>
          </div>
          {executions.length ? (
            <div className="automation-run-list">
              {executions.slice(0, 6).map((lead) => (
                <div className="automation-run" key={lead.id}>
                  <span className="automation-run-status">
                    <Check size={12} />
                  </span>
                  <div>
                    <strong>{lead.name || "Website customer"}</strong>
                    <span>{lead.project || "Project inquiry"}</span>
                    <time dateTime={lead.submittedAt}>
                      {new Date(lead.submittedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="automation-runs-empty">
              <Workflow size={22} />
              <strong>No runs yet</strong>
              <p>
                New website inquiries will appear here after they are captured.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
