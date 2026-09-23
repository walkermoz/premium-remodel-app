"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  FileClock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AuditAction, AuditEvent } from "@/lib/audit";

const labels: Record<string, string> = {
  project: "project",
  quote: "quote",
  task: "work item",
  contractor: "contractor",
  scope: "scope item",
  comment: "note",
  attachment: "file",
  activity: "activity",
  alert: "alert",
  teammate: "teammate",
  setting: "setting",
  location: "location sharing",
  session: "session",
  account: "account",
  contact: "contact",
  lead: "lead",
  door_visit: "house visit",
  sms: "text message",
  client_link: "client portal link",
  calendar: "Google Calendar connection",
};

const fieldLabels: Record<string, string> = {
  full_name: "name",
  defaultModel: "default model",
  contractorId: "contractor",
  dueDate: "due date",
  startTime: "start time",
  endTime: "end time",
  projectId: "project",
  contractPrice: "contract price",
  subCost: "sub cost",
  materialCost: "material cost",
  attachmentIds: "attachments",
  coverAttachmentId: "cover photo",
};

function actionText(entry: AuditEvent) {
  if (entry.action === "created") {
    if (entry.entityKind === "sms") return "sent app link";
    if (entry.entityKind === "alert") return "posted alert";
    if (entry.entityKind === "comment") return "added note";
    if (entry.entityKind === "attachment") return "uploaded file";
    if (entry.entityKind === "activity") return "logged activity";
    if (entry.entityKind === "door_visit") return "marked a house visit";
  }
  if (entry.action === "deleted" && entry.entityKind === "alert")
    return "removed alert";
  if (entry.entityKind === "client_link")
    return entry.action === "deleted"
      ? "disabled client portal"
      : entry.action === "updated"
        ? "replaced client portal link"
        : "created client portal link";
  if (entry.entityKind === "calendar")
    return entry.action === "deleted"
      ? "disconnected Google Calendar"
      : entry.action === "created"
        ? "connected Google Calendar"
        : "synced Google Calendar";
  if (entry.entityKind === "session")
    return entry.action === "created" ? "signed in" : "signed out";
  if (entry.entityKind === "location") return "changed location sharing";
  if (entry.entityKind === "setting") return "changed a setting";
  if (entry.entityKind === "account") return "changed account security";
  if (entry.action === "deleted" && entry.entityKind === "teammate")
    return "removed teammate";
  if (entry.action === "created" && entry.entityKind === "teammate")
    return "invited teammate";
  return `${entry.action} ${labels[entry.entityKind] || entry.entityKind}`;
}

function ActionIcon({ action }: { action: AuditAction }) {
  if (action === "created") return <Plus size={13} aria-hidden="true" />;
  if (action === "deleted") return <Trash2 size={13} aria-hidden="true" />;
  return <Pencil size={12} aria-hidden="true" />;
}

const INITIAL_VISIBLE = 3;

export default function WorkspaceHistorySettings({ demo }: { demo: boolean }) {
  const [entries, setEntries] = useState<AuditEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (offset = 0) => {
      if (demo) return;
      if (offset) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/audit?offset=${offset}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setEntries((current) =>
          offset ? [...current, ...result.entries] : result.entries,
        );
        setHasMore(result.hasMore);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load workspace history.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("premium-remodel-audit-updated", refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("premium-remodel-audit-updated", refresh);
    };
  }, [load]);

  return (
    <section className="settings-section" aria-labelledby="history-heading">
      <div className="settings-title">
        <FileClock size={22} aria-hidden="true" />
        <div>
          <h2 id="history-heading">Workspace history</h2>
          <p>
            Administrator log of who created, changed, or removed company
            records and when.
          </p>
        </div>
      </div>
      <div className="workspace-history">
        <div className="workspace-history-toolbar">
          <div>
            <strong>Latest changes</strong>
            {!demo && (
              <span>
                {expanded
                  ? `${entries.length} shown`
                  : `${Math.min(entries.length, INITIAL_VISIBLE)} of ${entries.length}${hasMore ? "+" : ""} shown`}
              </span>
            )}
          </div>
          {!demo && (
            <button
              type="button"
              className="text-button"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} aria-hidden="true" />
              Refresh
            </button>
          )}
        </div>
        {demo ? (
          <p className="generation-note">
            Workspace history begins in your signed-in company workspace.
          </p>
        ) : error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : loading ? (
          <p className="generation-note" role="status">
            Loading history…
          </p>
        ) : entries.length ? (
          <>
            <ol className="workspace-history-list">
              {(expanded
                ? entries
                : entries.slice(0, INITIAL_VISIBLE)
              ).map((entry) => (
                <li key={entry.id}>
                  <span
                    className={`history-action history-action-${entry.action}`}
                  >
                    <ActionIcon action={entry.action} />
                  </span>
                  <div>
                    <p>
                      <strong>{entry.actorName}</strong> {actionText(entry)}
                    </p>
                    <span className="history-subject">{entry.subject}</span>
                    {entry.changedFields.length > 0 && (
                      <span className="history-changes">
                        Changed:{" "}
                        {entry.changedFields
                          .map((field) => fieldLabels[field] || field)
                          .join(", ")}
                      </span>
                    )}
                    <small title={entry.actorEmail || undefined}>
                      <Clock3 size={11} aria-hidden="true" />
                      <time dateTime={entry.occurredAt}>
                        {new Date(entry.occurredAt).toLocaleString()}
                      </time>
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="workspace-history-actions">
              {(entries.length > INITIAL_VISIBLE || hasMore) && (
                <button
                  type="button"
                  className="button small-button"
                  onClick={() => {
                    if (!expanded) {
                      setExpanded(true);
                      return;
                    }
                    if (hasMore) void load(entries.length);
                    else setExpanded(false);
                  }}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? "Loading…"
                    : !expanded
                      ? `Show more (${entries.length - INITIAL_VISIBLE}${hasMore ? "+" : ""} older)`
                      : hasMore
                        ? "Show older changes"
                        : "Show less"}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="generation-note">
            No changes have been recorded yet. History starts when this feature
            is enabled.
          </p>
        )}
      </div>
    </section>
  );
}
