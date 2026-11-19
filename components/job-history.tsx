"use client";
import {
  ArrowUpRight,
  ClipboardList,
  History,
  StickyNote,
  ReceiptText,
} from "lucide-react";
import { jobRecords, sameJobCustomer } from "@/lib/job-workspace";
import type { Project, Quote, Workspace } from "@/lib/types";
import { scopeTotal } from "@/lib/project-finances";
import { useRegionalFormat } from "./regional-format-context";
import styles from "./job-workspace.module.css";

export default function JobHistory({
  record,
  workspace,
  canQuotes = true,
  canProjects = true,
  onOpen,
  showEvents = true,
}: {
  record: Project | Quote;
  workspace: Workspace;
  canQuotes?: boolean;
  canProjects?: boolean;
  onOpen?: (kind: "quote" | "project", id: string) => void;
  showEvents?: boolean;
}) {
  const regional = useRegionalFormat();
  const related = [
    ...jobRecords(workspace),
    ...(workspace.quotes || [])
      .filter((quote) => !quote.junkedAt)
      .map((record) => ({ kind: "quote" as const, record })),
  ].filter(
    (entry) =>
      (entry.kind === "quote" ? canQuotes : canProjects) &&
      sameJobCustomer(record, entry.record),
  );
  const events = [
    ...workspace.comments
      .filter((note) => note.projectId === record.id)
      .map((note) => ({
        id: note.id,
        date: note.createdAt,
        title: note.authorName || "Job note",
        detail: note.body,
        type: "Note",
        icon: StickyNote,
      })),
    ...(workspace.activities || [])
      .filter((a) => a.projectId === record.id)
      .map((a) => ({
        id: a.id,
        date: a.occurredAt,
        title: a.summary,
        detail: a.notes,
        type: a.activityType,
        icon: a.activityType === "Payment received" ? ReceiptText : History,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className={styles.history}>
      <section>
        <header className={styles.sectionHeading}>
          <div>
            <h2>Location & customer history</h2>
            <p>Records linked by contact, email, or service address.</p>
          </div>
        </header>
        {related.map((entry) => (
          <button
            className={styles.historyRecord}
            key={entry.record.id}
            disabled={!onOpen || entry.record.id === record.id}
            onClick={() => onOpen?.(entry.kind, entry.record.id)}
          >
            <ClipboardList size={20} />
            <span>
              <strong>{entry.record.name}</strong>
              <small>
                {entry.kind === "quote" ? "Estimate" : entry.record.status} ·{" "}
                {regional.date(entry.record.updatedAt)}
                {entry.record.id === record.id ? " · Current job" : ""}
              </small>
            </span>
            <b>
              {regional.money(scopeTotal(workspace.scope, entry.record.id))}
            </b>
            {onOpen && entry.record.id !== record.id && (
              <ArrowUpRight size={16} />
            )}
          </button>
        ))}
      </section>
      {showEvents && (
        <section>
          <header className={styles.sectionHeading}>
            <div>
              <h2>Job history</h2>
              <p>Notes, payments, and recorded work, most recent first.</p>
            </div>
          </header>
          {events.length ? (
            events.map((event) => (
              <article className={styles.timelineRow} key={event.id}>
                <event.icon size={18} />
                <div>
                  <small>
                    {event.type} · {regional.date(event.date)}
                  </small>
                  <h3>{event.title}</h3>
                  {event.detail && <p>{event.detail}</p>}
                </div>
              </article>
            ))
          ) : (
            <p className={styles.emptyLine}>
              No activity has been recorded for this job.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
