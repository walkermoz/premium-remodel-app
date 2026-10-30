"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  BellRing,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Inbox,
  MailCheck,
  RefreshCw,
  Save,
  UserRoundSearch,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { AutomationRun } from "@/lib/automation-runs";
import {
  defaultWebsiteLeadAutomation,
  websiteLeadDispositions,
  websiteLeadStages,
  type WebsiteLeadAutomation,
} from "@/lib/automation-config";
import type { Lead, User } from "@/lib/types";

type AutomationRevision = {
  revision: number;
  definition: WebsiteLeadAutomation;
  actorName: string;
  changedAt: string;
};

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
    <div
      className={`automation-connector ${branch ? "is-branch" : ""}`}
      aria-hidden="true"
    >
      {branch ? (
        <>
          <span className="automation-branch-label">IN PARALLEL</span>
          <span className="automation-branch-arm is-left" />
          <span className="automation-branch-arm is-right" />
        </>
      ) : (
        <span className="automation-connector-arrow">
          <ArrowDown size={14} strokeWidth={2.1} />
        </span>
      )}
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
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  const [runsLoading, setRunsLoading] = useState(!demo);
  const [runsError, setRunsError] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [retryingStep, setRetryingStep] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState<AutomationRevision[]>([]);
  const [restoring, setRestoring] = useState(false);
  const editable = !demo && user.role === "admin";

  const loadRuns = useCallback(
    async (offset = 0) => {
      if (demo) return;
      setRunsLoading(true);
      setRunsError("");
      try {
        const response = await fetch(
          `/api/automations/website-leads/runs?offset=${offset}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load workflow runs.");
        setRuns((current) =>
          offset ? [...current, ...(data.runs as AutomationRun[])] : data.runs,
        );
        setRunCount(data.total);
        setRecentCount(data.recentCount);
        setAttentionCount(data.attentionCount);
      } catch (reason) {
        setRunsError(
          reason instanceof Error
            ? reason.message
            : "Could not load workflow runs.",
        );
      } finally {
        setRunsLoading(false);
      }
    },
    [demo],
  );

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

  useEffect(() => {
    if (demo) return;
    queueMicrotask(() => void loadRuns());
    const refresh = () => {
      if (!document.hidden) void loadRuns();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [demo, loadRuns]);

  const demoRuns: AutomationRun[] = demo
    ? leads
        .filter((lead) => /website|web form/i.test(lead.source || ""))
        .map((lead) => ({
          id: lead.id,
          leadId: lead.id,
          subject: lead.name,
          project: lead.project,
          status: "completed" as const,
          steps: [
            {
              key: "contact" as const,
              label: "Customer contact",
              status: "created" as const,
            },
            { key: "lead" as const, label: "Lead", status: "created" as const },
          ],
          startedAt: lead.submittedAt,
          completedAt: lead.submittedAt,
        }))
    : [];
  const visibleRuns = demo ? demoRuns : runs;
  const visibleRecentCount = demo ? demoRuns.length : recentCount;

  function update(patch: Partial<WebsiteLeadAutomation>) {
    setAutomation((current) => ({ ...current, ...patch }));
    setDirty(true);
    setMessage("");
    setError("");
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/automations/website-leads/revisions", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load workflow history.");
      setHistory(data.revisions);
    } catch (reason) {
      setHistoryError(
        reason instanceof Error
          ? reason.message
          : "Could not load workflow history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  function toggleHistory() {
    if (!historyOpen) void loadHistory();
    setHistoryOpen((current) => !current);
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
      if (historyOpen) void loadHistory();
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

  async function restoreRevision(item: AutomationRevision) {
    if (
      !editable ||
      dirty ||
      restoring ||
      item.revision === automation.revision
    )
      return;
    setRestoring(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/automations/website-leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item.definition,
          revision: automation.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not restore this version.");
      setAutomation(data);
      setMessage(
        `Version ${item.revision} restored as version ${data.revision}`,
      );
      await loadHistory();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not restore this version.",
      );
    } finally {
      setRestoring(false);
    }
  }

  async function retry(runId: string, step: "email" | "team") {
    if (!editable || retryingStep) return;
    setRetryingStep(`${runId}:${step}`);
    setRunsError("");
    try {
      const response = await fetch(
        `/api/automations/website-leads/runs/${encodeURIComponent(runId)}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not retry this action.");
      await loadRuns();
    } catch (reason) {
      await loadRuns();
      setRunsError(
        reason instanceof Error
          ? reason.message
          : "Could not retry this action.",
      );
    } finally {
      setRetryingStep(null);
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
              disabled={!dirty || saving || restoring || loading}
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
            <p>Changes to this workflow are saved as versions.</p>
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
            <strong>{visibleRecentCount}</strong>
            <small>
              {visibleRecentCount === 1 ? "run recorded" : "runs recorded"}
            </small>
            {!demo && attentionCount > 0 && (
              <small className="automation-attention-count">
                {attentionCount} need attention
              </small>
            )}
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
            <div className="automation-builder-controls">
              <span className="automation-version">
                {automation.revision
                  ? `Version ${automation.revision}`
                  : "Default settings"}
              </span>
              {!demo && (
                <button
                  type="button"
                  className="automation-history-trigger"
                  aria-expanded={historyOpen}
                  onClick={toggleHistory}
                >
                  History
                </button>
              )}
            </div>
          </div>

          {historyOpen && (
            <section
              className="automation-history"
              aria-label="Workflow history"
            >
              <div className="automation-history-heading">
                <strong>Saved versions</strong>
                <span>Restore an earlier version to make it current.</span>
              </div>
              {historyError && <p role="alert">{historyError}</p>}
              {historyLoading ? (
                <p>Loading history…</p>
              ) : history.length ? (
                <ol>
                  {history.map((item) => (
                    <li key={item.revision}>
                      <div>
                        <strong>Version {item.revision}</strong>
                        <span>
                          {item.actorName} ·{" "}
                          {new Date(item.changedAt).toLocaleString()}
                        </span>
                        <small>
                          {item.definition.initialStage} ·{" "}
                          {item.definition.initialDisposition} · Email{" "}
                          {item.definition.sendAcknowledgement ? "on" : "off"}
                          {" · "}Team{" "}
                          {item.definition.sendTeamNotification ? "on" : "off"}
                        </small>
                      </div>
                      {editable && item.revision !== automation.revision && (
                        <button
                          type="button"
                          disabled={dirty || restoring || saving}
                          title={
                            dirty
                              ? "Save or discard unsaved changes first"
                              : undefined
                          }
                          onClick={() => void restoreRevision(item)}
                        >
                          {restoring ? "Restoring…" : "Restore"}
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No saved versions yet.</p>
              )}
            </section>
          )}

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
            <div className="automation-runs-tools">
              <span>{demo ? visibleRuns.length : runCount} total</span>
              {!demo && (
                <button
                  type="button"
                  aria-label="Refresh workflow runs"
                  title="Refresh runs"
                  disabled={runsLoading}
                  onClick={() => void loadRuns()}
                >
                  <RefreshCw size={14} className={runsLoading ? "spin" : ""} />
                </button>
              )}
            </div>
          </div>
          {runsError && (
            <p className="automation-runs-error" role="alert">
              {runsError}
            </p>
          )}
          {visibleRuns.length ? (
            <div className="automation-run-list">
              {visibleRuns.map((run) => (
                <div className="automation-run" key={run.id}>
                  <button
                    className="automation-run-summary"
                    type="button"
                    aria-expanded={expandedRunId === run.id}
                    onClick={() =>
                      setExpandedRunId((current) =>
                        current === run.id ? null : run.id,
                      )
                    }
                  >
                    <span
                      className={`automation-run-status is-${run.status}`}
                      aria-hidden="true"
                    >
                      {run.status === "needs_attention" ? (
                        <AlertCircle size={13} />
                      ) : run.status === "running" ? (
                        <Clock3 size={13} />
                      ) : (
                        <Check size={13} />
                      )}
                    </span>
                    <span className="automation-run-summary-copy">
                      <strong>{run.subject || "Website customer"}</strong>
                      <span>{run.project || "Project inquiry"}</span>
                      <time dateTime={run.startedAt}>
                        {new Date(run.startedAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </span>
                    <ChevronDown
                      size={14}
                      className={expandedRunId === run.id ? "is-open" : ""}
                    />
                  </button>
                  {expandedRunId === run.id && (
                    <div className="automation-run-details">
                      <strong>
                        {run.status === "needs_attention"
                          ? "Needs attention"
                          : run.status === "running"
                            ? "Running"
                            : "Completed"}
                      </strong>
                      <ol>
                        {run.steps.map((step) => (
                          <li key={step.key}>
                            <span>{step.label}</span>
                            <b>{step.status.replaceAll("_", " ")}</b>
                            {step.detail && <small>{step.detail}</small>}
                            {step.attempts && step.attempts > 1 && (
                              <small>{step.attempts} attempts</small>
                            )}
                            {step.status === "unknown" && (
                              <small>
                                Delivery may have succeeded. Check the mailbox
                                or team channel before sending again.
                              </small>
                            )}
                            {editable &&
                              (step.key === "email" || step.key === "team") &&
                              (step.status === "failed" ||
                                step.status === "not_configured") && (
                                <button
                                  className="automation-run-retry"
                                  type="button"
                                  disabled={Boolean(retryingStep)}
                                  onClick={() =>
                                    void retry(
                                      run.id,
                                      step.key as "email" | "team",
                                    )
                                  }
                                >
                                  {retryingStep === `${run.id}:${step.key}`
                                    ? "Retrying…"
                                    : "Retry action"}
                                </button>
                              )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
              {!demo && visibleRuns.length < runCount && (
                <button
                  className="automation-runs-more"
                  type="button"
                  disabled={runsLoading}
                  onClick={() => void loadRuns(visibleRuns.length)}
                >
                  {runsLoading ? "Loading…" : "Load more runs"}
                </button>
              )}
            </div>
          ) : (
            <div className="automation-runs-empty">
              <Workflow size={22} />
              <strong>{runsLoading ? "Loading runs…" : "No runs yet"}</strong>
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
