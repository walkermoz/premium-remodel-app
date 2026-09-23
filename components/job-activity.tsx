"use client";
import { useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Paperclip,
  CheckCheck,
  PackageCheck,
  ArrowDownLeft,
  ArrowUpRight,
  MessageSquare,
} from "lucide-react";
import type {
  Activity,
  Entity,
  EntityKind,
  Task,
  User,
  Workspace,
} from "@/lib/types";
import { activityTypes } from "@/lib/types";
import {
  activityHeadline,
  activityMoney,
  activityTotals,
  workspaceActivities,
} from "@/lib/activity";
import { Avatar, Empty } from "./ui";

export function ActivityPaymentTotals({
  activities,
}: {
  activities: Activity[];
}) {
  const totals = activityTotals(activities);
  return (
    <div
      className="activity-payment-totals"
      aria-label="Logged project payments"
    >
      <div>
        <span>Customer payments received</span>
        <strong>{activityMoney(totals.received)}</strong>
      </div>
      <div>
        <span>Subcontractors paid</span>
        <strong>{activityMoney(totals.paid)}</strong>
      </div>
      <p>From logged payments on this project.</p>
    </div>
  );
}

export default function JobActivity({
  workspace,
  user,
  demo,
  projectId = "",
  onLog,
  onDelete,
  onProject,
  onTask,
}: {
  workspace: Workspace;
  user: User;
  demo: boolean;
  projectId?: string;
  onLog: (projectId?: string) => void;
  onDelete: (kind: EntityKind, entity: Entity) => void;
  onProject?: (id: string) => void;
  onTask: (task: Task) => void;
}) {
  const [projectFilter, setProjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const selectedProject = projectId || projectFilter;
  const entries = workspaceActivities(workspace).filter(({ entry }) => {
    const project = workspace.projects.find((p) => p.id === entry.projectId);
    return (
      (!selectedProject || entry.projectId === selectedProject) &&
      (!typeFilter || entry.activityType === typeFilter) &&
      (!search ||
        `${activityHeadline(entry)} ${entry.summary} ${entry.notes} ${project?.name || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()))
    );
  });
  return (
    <>
      <div className={projectId ? "section-heading" : "page-heading"}>
        <div>
          {!projectId && <span className="eyebrow">WORKSPACE</span>}
          {projectId ? (
            <h2>Project activity</h2>
          ) : (
            <h1>
              Activity<span className="heading-dot">.</span>
            </h1>
          )}
          <p>
            Payments, deliveries, completed work, and updates from the team.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => onLog(selectedProject)}
        >
          <Plus size={16} />
          Log activity
        </button>
      </div>
      {projectId && (
        <ActivityPaymentTotals
          activities={(workspace.activities || []).filter(
            (item) => item.projectId === projectId,
          )}
        />
      )}
      <div className="job-activity-filters">
        <div className="activity-search">
          <Search size={16} />
          <input
            aria-label="Search activity"
            placeholder="Search activity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!projectId && (
          <select
            aria-label="Filter activity by project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All projects</option>
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter activity by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All activity</option>
          {[...activityTypes, "Work completed"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="job-activity-feed">
        {entries.map(({ entry, kind }) => {
          const project = workspace.projects.find(
            (p) => p.id === entry.projectId,
          );
          const task = workspace.tasks.find((t) => t.id === entry.sourceTaskId);
          const Icon =
            entry.activityType === "Payment received"
              ? ArrowDownLeft
              : entry.activityType === "Subcontractor paid"
                ? ArrowUpRight
                : entry.activityType === "Materials delivered"
                  ? PackageCheck
                  : entry.activityType === "Work completed"
                    ? CheckCheck
                    : MessageSquare;
          return (
            <article className="job-activity-entry" key={entry.id}>
              <Avatar name={entry.actorName} />
              <div className="job-activity-body">
                <div className="job-activity-meta">
                  <span className="activity-type">
                    <Icon size={14} />
                    {entry.activityType}
                  </span>
                  <time dateTime={entry.occurredAt}>
                    {new Date(entry.occurredAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  {(user.role === "admin" || user.id === entry.authorId) && (
                    <button
                      className="icon-button delete-action"
                      aria-label="Delete activity"
                      onClick={() =>
                        onDelete(
                          kind,
                          kind === "comment"
                            ? workspace.comments.find((c) => c.id === entry.id)!
                            : entry,
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <h3>{activityHeadline(entry)}</h3>
                {entry.activityType !== "Work completed" && (
                  <p className="activity-summary">{entry.summary}</p>
                )}
                {!!entry.notes && (
                  <p className="activity-notes">{entry.notes}</p>
                )}
                <div className="job-activity-context">
                  {!projectId && project && (
                    <button
                      className="text-button"
                      onClick={() => onProject?.(entry.projectId)}
                    >
                      {project.name}
                    </button>
                  )}
                  {entry.paymentMethod && <span>{entry.paymentMethod}</span>}
                  {entry.actorId !== entry.authorId && (
                    <span>Logged by {entry.authorName}</span>
                  )}
                  {task && (
                    <button
                      className="text-button"
                      onClick={() => onTask(task)}
                    >
                      View work item
                    </button>
                  )}
                </div>
                {!!entry.attachmentIds.length && (
                  <div className="activity-file-links">
                    {entry.attachmentIds.map((id) => {
                      const file = workspace.attachments.find(
                        (f) => f.id === id,
                      );
                      return file ? (
                        <a
                          key={id}
                          href={
                            demo
                              ? file.path
                              : `/api/files?id=${encodeURIComponent(id)}&download=1`
                          }
                          download={file.name}
                        >
                          <Paperclip size={14} />
                          {file.name}
                        </a>
                      ) : (
                        <span key={id} className="muted">
                          Attachment removed
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!entries.length && (
        <Empty
          title={
            search || typeFilter || projectFilter
              ? "No matching activity"
              : "No activity yet"
          }
          text="Log a payment, delivery or update. Completed work also appears here."
        />
      )}
    </>
  );
}
