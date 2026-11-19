"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Plus,
  FileUp,
  Wrench,
  RotateCcw,
  Trash2,
  Grid2X2,
  List,
} from "lucide-react";
import { jobRecords, nextJobVisit, type JobRecord } from "@/lib/job-workspace";
import { sameJobCustomer } from "@/lib/job-workspace";
import { workToday } from "@/lib/work";
import { scopeTotal } from "@/lib/project-finances";
import type { Quote, Workspace } from "@/lib/types";
import type { ImportedQuote } from "@/lib/quote-import";
import QuoteImportDialog from "./quote-import-dialog";
import { useRegionalFormat } from "./regional-format-context";
import styles from "./job-workspace.module.css";

export default function JobsPanel({
  workspace,
  search,
  estimatesOnly = false,
  canProjects,
  canQuotes,
  demo,
  onOpen,
  onNewProject,
  onNewContainer,
  onNewQuote,
  onImport,
  onSaveQuote,
}: {
  workspace: Workspace;
  search: string;
  estimatesOnly?: boolean;
  canProjects: boolean;
  canQuotes: boolean;
  demo: boolean;
  onOpen: (kind: "project" | "quote", id: string) => void;
  onNewProject: () => void;
  onNewContainer: () => void;
  onNewQuote: () => void;
  onSaveQuote: (
    data: Record<string, unknown>,
    quote: Quote,
  ) => Promise<unknown>;
  onImport: (
    quotes: ImportedQuote[],
    options: { combine: boolean; combinedName: string },
  ) => Promise<void>;
}) {
  const regional = useRegionalFormat();
  const [filter, setFilter] = useState(
    estimatesOnly ? "Estimating" : "All jobs",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const estimatesLabel = canProjects ? "Unassigned estimates" : "Estimates";
  const [mode, setMode] = useState(
    estimatesOnly ? estimatesLabel : "Jobs",
  );
  const records: JobRecord[] = (
    mode === "Projects"
      ? workspace.projects
          .filter((record) => record.recordType === "project")
          .map((record) => ({ kind: "project" as const, record }))
      : mode === estimatesLabel
        ? (workspace.quotes || [])
            .filter((record) => !record.jobId || !canProjects)
            .map((record) => ({ kind: "quote" as const, record }))
        : jobRecords(workspace)
  ).filter(({ kind }) => (kind === "project" ? canProjects : canQuotes));
  const matches = ({ kind, record }: JobRecord, f: string) => {
    const junk = kind === "quote" && Boolean(record.junkedAt);
    if (f === "Junk") return junk;
    if (junk) return false;
    return (
      f === "All jobs" ||
      (f === "Estimating"
        ? kind === "quote"
        : kind === "project" && record.status === f)
    );
  };
  const visible = records.filter(
    (entry) =>
      matches(entry, filter) &&
      `${entry.record.name} ${entry.record.client} ${entry.record.address} ${entry.record.quoteNumber || ""} ${entry.record.category}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section className={styles.jobs}>
      <header className={styles.listHeader}>
        <div>
          <span className={styles.eyebrow}>WORKSPACE</span>
          <h1>{mode === "Jobs" ? "All jobs" : mode}</h1>
          <p>
            {mode === "Jobs"
              ? "Jobs and appointments. Estimate options and invoices stay inside each job."
              : mode === "Projects"
                ? "Longer projects group related jobs and visits."
                : "Legacy and imported estimates that have not been linked to a job."}
          </p>
        </div>
        <div>
          {canQuotes && mode === estimatesLabel && (
            <>
              <button
                className="button secondary"
                onClick={() => setImportOpen(true)}
                disabled={demo}
              >
                <FileUp size={15} /> Import PDFs
              </button>
              <button className="button primary" onClick={onNewQuote}>
                <Plus size={16} /> New estimate
              </button>
            </>
          )}
          {canProjects && mode !== estimatesLabel && (
            <button
              className="button primary"
              onClick={mode === "Projects" ? onNewContainer : onNewProject}
            >
              <Plus size={16} />{" "}
              {mode === "Projects" ? "New project" : "New job"}
            </button>
          )}
        </div>
      </header>
      <div
        className={styles.filters}
        role="group"
        aria-label="Workspace records"
      >
        {[
          ...(canProjects ? ["Jobs", "Projects"] : []),
          ...(canQuotes ? [estimatesLabel] : []),
        ].map((item) => (
          <button
            key={item}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              setFilter("All jobs");
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className={styles.filters} role="group" aria-label="Filter jobs">
        {[
          "All jobs",
          ...(canQuotes && mode === estimatesLabel
            ? ["Estimating"]
            : []),
          ...(canProjects && mode !== estimatesLabel
            ? ["Planning", "In progress", "On hold", "Completed"]
            : []),
          ...(canQuotes && mode === estimatesLabel ? ["Junk"] : []),
        ].map((f) => (
          <button
            key={f}
            aria-label={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
            <span>{records.filter((entry) => matches(entry, f)).length}</span>
          </button>
        ))}
      </div>
      <div className={styles.listToolbar}>
        <span>
          {visible.length} {visible.length === 1 ? "job" : "jobs"}
        </span>
        <span>Most recently updated</span>
        <div className="view-options">
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={16} />
          </button>
          <button
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={16} />
          </button>
        </div>
      </div>
      <div
        className={`${styles.jobList} ${view === "list" ? `${styles.singleColumn} list-view` : ""}`}
      >
        {visible.map(({ record, kind }) => {
          const tasks = workspace.tasks.filter(
            (t) => t.projectId === record.id,
          );
          const next =
            kind === "project"
              ? nextJobVisit(
                  record as import("@/lib/types").Project,
                  tasks,
                  workToday(new Date(), regional.timezone),
                )
              : undefined;
          return (
            <article
              key={record.id}
              data-testid="job-card"
              data-kind={kind}
              className={styles.jobCard}
            >
              <button
                className={styles.jobOpen}
                aria-label={`${record.name} · ${record.client || "Job"}`}
                onClick={() => onOpen(kind, record.id)}
              >
                <div className={styles.jobStatus}>
                  <span
                    data-status={
                      kind === "quote" ? "Estimating" : record.status
                    }
                  >
                    {kind === "quote"
                      ? `Estimate · ${record.status}`
                      : record.status}
                  </span>
                  <small>
                    JOB #
                    {record.quoteNumber || record.id.slice(0, 8).toUpperCase()}
                  </small>
                </div>
                <div className={styles.jobCardTitle}>
                  <div>
                    <h2>{record.name}</h2>
                    <strong>{record.client || "Customer not added"}</strong>
                  </div>
                  <ArrowUpRight size={21} />
                </div>
                <div className={styles.jobCardMeta}>
                  <span>
                    <Wrench size={15} />
                    {record.category || "Remodeling"}
                  </span>
                  <span>
                    <MapPin size={15} />
                    {record.address || "Address not added"}
                  </span>
                </div>
              </button>
              <footer>
                <span>
                  <CalendarDays size={16} />
                  {next
                    ? regional.date(next.dueDate)
                    : record.startDate
                      ? regional.date(record.startDate)
                      : "Not scheduled"}
                  {next?.startTime && ` · ${next.startTime}`}
                </span>
                <strong>
                  {regional.money(scopeTotal(workspace.scope, record.id))}
                </strong>
                <button
                  className={styles.openJob}
                  onClick={() => onOpen(kind, record.id)}
                >
                  Open job <ArrowUpRight size={14} />
                </button>
                {kind === "quote" && (
                  <label className={styles.linkEstimate}>
                    Link to job
                    <select
                      aria-label={`Link ${record.name} to job`}
                      disabled={
                        savingId === record.id || record.status === "Accepted"
                      }
                      value=""
                      onChange={async (event) => {
                        const job = workspace.projects.find(
                          (job) => job.id === event.target.value,
                        );
                        if (!job) return;
                        setSavingId(record.id);
                        setError("");
                        try {
                          await onSaveQuote(
                            { ...record, jobId: job.id },
                            record,
                          );
                        } catch (error) {
                          setError(
                            error instanceof Error
                              ? error.message
                              : "Could not link estimate.",
                          );
                        } finally {
                          setSavingId("");
                        }
                      }}
                    >
                      <option value="">Choose matching job</option>
                      {workspace.projects
                        .filter(
                          (job) =>
                            job.recordType !== "project" &&
                            job.status !== "Completed" &&
                            sameJobCustomer(job, record),
                        )
                        .map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {kind === "quote" && (
                  <button
                    className="icon-button"
                    disabled={savingId === record.id}
                    aria-label={
                      record.junkedAt
                        ? `Restore ${record.name} to quotes`
                        : `Move ${record.name} to junk`
                    }
                    onClick={async () => {
                      setSavingId(record.id);
                      setError("");
                      try {
                        await onSaveQuote(
                          {
                            ...record,
                            junkedAt: record.junkedAt
                              ? null
                              : new Date().toISOString(),
                          },
                          record,
                        );
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Could not update this estimate.",
                        );
                      } finally {
                        setSavingId("");
                      }
                    }}
                  >
                    {record.junkedAt ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className={styles.empty}>
          <Wrench size={27} />
          <h2>No matching jobs</h2>
          <p>
            Choose another status or search by customer, address, or job number.
          </p>
          {canQuotes && mode === estimatesLabel && (
            <button className="button primary" onClick={onNewQuote}>
              New estimate
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {importOpen && (
        <QuoteImportDialog
          onClose={() => setImportOpen(false)}
          onImport={onImport}
        />
      )}
    </section>
  );
}
