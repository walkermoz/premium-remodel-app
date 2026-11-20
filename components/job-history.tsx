"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { jobRecords, sameJobCustomer } from "@/lib/job-workspace";
import { projectFinances, scopeTotal } from "@/lib/project-finances";
import { jobOperations } from "@/lib/job-operations";
import type { JobForm } from "@/lib/job-operations";
import type { Project, Quote, Workspace } from "@/lib/types";
import { Modal } from "./ui";
import { useRegionalFormat } from "./regional-format-context";
import styles from "./job-workspace.module.css";

const categories = [
  "Invoices",
  "Estimates",
  "Forms",
  "Photos & files",
  "Notes",
  "Job activity",
] as const;
export default function JobHistory({
  record,
  workspace,
  canQuotes = true,
  canProjects = true,
  onOpen,
  onLog,
  demo = false,
}: {
  record: Project | Quote;
  workspace: Workspace;
  canQuotes?: boolean;
  canProjects?: boolean;
  onOpen?: (kind: "quote" | "project", id: string) => void;
  demo?: boolean;
  onLog?: () => void;
}) {
  const regional = useRegionalFormat();
  const [scope, setScope] = useState("Location");
  const [category, setCategory] =
    useState<(typeof categories)[number]>("Invoices");
  const [selectedForm, setSelectedForm] = useState<{
    form: JobForm;
    job: Project;
  } | null>(null);
  const matches = (candidate: Project | Quote) =>
    scope === "Customer"
      ? sameJobCustomer(record, candidate)
      : Boolean(
          record.address.trim() &&
          record.address.trim().toLowerCase() ===
            candidate.address.trim().toLowerCase(),
        ) || candidate.id === record.id;
  const jobs = canProjects
    ? jobRecords(workspace)
        .map((entry) => entry.record as Project)
        .filter(matches)
    : [];
  const estimates = canQuotes
    ? (workspace.quotes || []).filter(
        (quote) => !quote.junkedAt && matches(quote),
      )
    : [];
  const recordIds = new Set([...jobs, ...estimates].map((item) => item.id));
  const forms = jobs
    .flatMap((job) => jobOperations(job).forms.map((form) => ({ form, job })))
    .sort((a, b) =>
      (b.form.completedAt || b.job.updatedAt).localeCompare(
        a.form.completedAt || a.job.updatedAt,
      ),
    );
  const files = workspace.attachments
    .filter((file) => recordIds.has(file.projectId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notes = workspace.comments
    .filter((note) => recordIds.has(note.projectId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const events = [
    ...(record.job?.history || []).map((event, index) => ({
      id: `operation-${event.at}-${index}`,
      at: event.at,
      by: event.by,
      detail: event.detail,
    })),
    ...(workspace.activities || [])
      .filter(
        (event) =>
          event.projectId === record.id || event.invoiceJobId === record.id,
      )
      .map((event) => ({
        id: event.id,
        at: event.occurredAt,
        by: event.actorName,
        detail: `${event.summary}${event.amount !== null ? ` · ${regional.money(event.amount)}` : ""}${event.notes ? ` · ${event.notes}` : ""}`,
      })),
    ...workspace.comments
      .filter((note) => note.projectId === record.id)
      .map((note) => ({
        id: note.id,
        at: note.createdAt,
        by: note.authorName,
        detail: note.body || "Attached files",
      })),
    ...workspace.attachments
      .filter((file) => file.projectId === record.id)
      .map((file) => ({
        id: file.id,
        at: file.createdAt,
        by: file.authorName,
        detail: `Uploaded ${file.name}`,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const jobName = (id: string) =>
    [...jobs, ...estimates].find((item) => item.id === id)?.name || "Job";
  return (
    <section className={styles.history} aria-label="Job history">
      <header className={styles.sectionHeading}>
        <div>
          <h2>Service history</h2>
          <p>
            Review invoices, estimates, forms, notes, and files without changing
            their source records.
          </p>
        </div>
        <label>
          History scope
          <select
            aria-label="History scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option>Location</option>
            <option>Customer</option>
          </select>
        </label>
      </header>
      <div
        className={styles.filters}
        role="group"
        aria-label="History category"
      >
        {categories
          .filter((item) => item !== "Estimates" || canQuotes)
          .map((item) => (
            <button
              key={item}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
      </div>
      {category === "Invoices" && (
        <section aria-label="Historical invoices">
          {jobs
            .filter((job) => job.id !== record.id)
            .map((job) => {
              const finances = projectFinances(
                job,
                workspace.scope,
                workspace.activities,
              );
              return (
                <button
                  className={styles.historyRecord}
                  key={job.id}
                  disabled={!onOpen}
                  onClick={() => onOpen?.("project", job.id)}
                >
                  <span>
                    <strong>{job.name}</strong>
                    <small>
                      {job.status} · {regional.date(job.updatedAt)}
                    </small>
                    <small>
                      Collected {regional.money(finances.collected)} · Balance{" "}
                      {regional.money(finances.remaining)}
                    </small>
                  </span>
                  <b>{regional.money(finances.total)}</b>
                  <ArrowUpRight size={16} />
                </button>
              );
            })}
          {!jobs.some((job) => job.id !== record.id) && (
            <p className={styles.emptyLine}>
              No earlier job invoices for this {scope.toLowerCase()}.
            </p>
          )}
        </section>
      )}
      {category === "Estimates" && (
        <section aria-label="Historical estimates">
          {estimates.map((quote) => (
            <button
              className={styles.historyRecord}
              key={quote.id}
              disabled={!onOpen}
              onClick={() => onOpen?.("quote", quote.id)}
            >
              <span>
                <strong>{quote.name}</strong>
                <small>
                  {quote.status} · {regional.date(quote.updatedAt)}
                </small>
              </span>
              <b>{regional.money(scopeTotal(workspace.scope, quote.id))}</b>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!estimates.length && (
            <p className={styles.emptyLine}>
              No estimates for this {scope.toLowerCase()}.
            </p>
          )}
        </section>
      )}
      {category === "Forms" && (
        <section aria-label="Historical forms">
          {forms.map(({ form, job }) => (
            <button
              key={`${job.id}:${form.id}`}
              className={styles.historyRecord}
              onClick={() => setSelectedForm({ form, job })}
            >
              <span>
                <strong>{form.title}</strong>
                <small>
                  {job.name} · {form.status}
                </small>
                {form.completedAt && (
                  <small>
                    {form.completedBy} · {regional.date(form.completedAt)}
                  </small>
                )}
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!forms.length && (
            <p className={styles.emptyLine}>
              No forms for this {scope.toLowerCase()}.
            </p>
          )}
        </section>
      )}
      {category === "Photos & files" && (
        <section aria-label="Historical files">
          {files.map((file) => (
            <a
              className={styles.historyRecord}
              key={file.id}
              href={
                demo
                  ? file.path
                  : `/api/files?id=${encodeURIComponent(file.id)}&download=1`
              }
              download={file.name}
            >
              <span>
                <strong>{file.name}</strong>
                <small>
                  {jobName(file.projectId)} · {regional.date(file.createdAt)}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </a>
          ))}
          {!files.length && (
            <p className={styles.emptyLine}>
              No files for this {scope.toLowerCase()}.
            </p>
          )}
        </section>
      )}
      {category === "Notes" && (
        <section aria-label="Historical notes">
          {notes.map((note) => (
            <article className={styles.timelineRow} key={note.id}>
              <div>
                <small>
                  {jobName(note.projectId)} · {note.authorName} ·{" "}
                  {regional.date(note.createdAt)}
                </small>
                <p>{note.body || "Attached files"}</p>
              </div>
            </article>
          ))}
          {!notes.length && (
            <p className={styles.emptyLine}>
              No notes for this {scope.toLowerCase()}.
            </p>
          )}
        </section>
      )}
      {category === "Job activity" && (
        <section aria-label="Current job audit trail">
          <div className={styles.sectionHeading}>
            <h3>This job’s activity</h3>
            {onLog && (
              <button className="button secondary" onClick={onLog}>
                Log activity
              </button>
            )}
          </div>
          {events.map((event) => (
            <article className={styles.timelineRow} key={event.id}>
              <div>
                <small>
                  {regional.date(event.at, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {event.by}
                </small>
                <p>{event.detail}</p>
              </div>
            </article>
          ))}
          {!events.length && (
            <p className={styles.emptyLine}>
              No activity recorded on this job.
            </p>
          )}
        </section>
      )}
      {selectedForm && (
        <Modal
          title={selectedForm.form.title}
          subtitle={`${selectedForm.job.name} · ${selectedForm.form.status}`}
          onClose={() => setSelectedForm(null)}
        >
          <p>Historical record · read only</p>
          {selectedForm.form.questions.map((question) => (
            <div key={question.id}>
              <strong>{question.label}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {question.answer || "Not answered"}
              </p>
            </div>
          ))}
          {selectedForm.form.completedAt && (
            <p>
              Submitted by {selectedForm.form.completedBy} ·{" "}
              {regional.date(selectedForm.form.completedAt)}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
