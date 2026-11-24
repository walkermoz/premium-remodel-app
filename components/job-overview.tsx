"use client";
import {
  CalendarDays,
  MapPin,
  Pencil,
  ArrowUpRight,
  Clock3,
} from "lucide-react";
import { contractClock } from "@/lib/project-timing";
import type { Project, Quote, Workspace } from "@/lib/types";
import { nextJobVisit, type JobSection } from "@/lib/job-workspace";
import { workToday } from "@/lib/work";
import { useRegionalFormat } from "./regional-format-context";
import { JobSectionLink } from "./job-workspace-shell";
import styles from "./job-workspace.module.css";

export default function JobOverview({
  record,
  kind,
  workspace,
  onSection,
  onEdit,
}: {
  record: Project | Quote;
  kind: "project" | "quote";
  workspace: Workspace;
  onSection: (s: JobSection) => void;
  onEdit?: () => void;
}) {
  const regional = useRegionalFormat();
  const tasks = workspace.tasks.filter((t) => t.projectId === record.id);
  const today = workToday(new Date(), regional.timezone);
  const next =
    kind === "project"
      ? nextJobVisit(record as Project, tasks, today)
      : undefined;
  const notes = workspace.comments.filter((c) => c.projectId === record.id);
  const formatTime = (time?: string) =>
    time
      ? new Date(`2000-01-01T${time}`).toLocaleTimeString(regional.locale, {
          hour: "numeric",
          minute: "2-digit",
        })
      : "Time to be confirmed";
  return (
    <div className={styles.overview}>
      <section className={styles.overviewIntro}>
        <div>
          <span className={styles.eyebrow}>JOB DETAILS</span>
          <h2>{record.category || "Remodeling"}</h2>
          <p>
            {record.description ||
              "Add a job summary so the team knows what is included."}
          </p>
          {onEdit && (
            <button className="text-button link" onClick={onEdit}>
              <Pencil size={14} /> Edit job details
            </button>
          )}
        </div>
        <div className={styles.arrival}>
          <h3>
            <CalendarDays size={17} />{" "}
            {kind === "quote" ? "Project dates" : "Arrival window"}
          </h3>
          {next ? (
            <>
              <strong>{next.title}</strong>
              <p>{regional.date(next.dueDate)}</p>
              <div>
                <span>
                  <small>STARTS</small>
                  <b>{formatTime(next.startTime)}</b>
                </span>
                <span>
                  <small>ENDS</small>
                  <b>{formatTime(next.endTime)}</b>
                </span>
              </div>
              <button
                className="text-button link"
                onClick={() => onSection("Schedule")}
              >
                View schedule <ArrowUpRight size={14} />
              </button>
            </>
          ) : (
            <>
              <p>
                {record.startDate
                  ? `Starts ${regional.date(record.startDate)}`
                  : "No upcoming work scheduled."}
              </p>
              {record.endDate && (
                <p>Target completion {regional.date(record.endDate)}</p>
              )}
              {(kind === "project" || onEdit) && (
                <button
                  className="text-button link"
                  onClick={
                    kind === "quote" ? onEdit : () => onSection("Schedule")
                  }
                >
                  {kind === "quote" ? "Set project dates" : "Schedule work"}
                </button>
              )}
            </>
          )}
        </div>
      </section>
      <div className={styles.overviewSplit}>
        <section>
          <h3>Service address</h3>
          <p className={styles.address}>
            <MapPin size={18} />
            {record.address || "Address not added"}
          </p>
          {record.address && (
            <a
              className="button secondary small-button"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(record.address)}`}
              target="_blank"
              rel="noreferrer"
            >
              Get directions <ArrowUpRight size={14} />
            </a>
          )}
        </section>
        <section>
          <JobSectionLink
            title="Estimates"
            detail={
              kind === "quote"
                ? "Build, price, and present this estimate"
                : "Compare, recommend, and present estimate options"
            }
            value={
              kind === "project"
                ? (workspace.quotes || []).filter(
                    (quote) => quote.jobId === record.id && !quote.junkedAt,
                  ).length
                : "Open"
            }
            onClick={() => onSection("Estimates")}
          />
          <JobSectionLink
            title="Job notes"
            detail={
              notes[0]?.body.slice(0, 100) ||
              "Keep site instructions and customer preferences together"
            }
            value={notes.length}
            onClick={() => onSection("Notes")}
          />
          <JobSectionLink
            title="Forms & agreements"
            detail={
              kind === "project"
                ? `${(record as Project).job?.forms.filter((form) => form.required && form.status !== "Complete").length || 0} required forms remaining`
                : "Review documents and signatures"
            }
            onClick={() => onSection("Forms")}
          />
        </section>
      </div>
      <section className={styles.summarySection}>
        <h3>Work summary</h3>
        {kind === "project" && (
          <div className={`project-contract-clock ${styles.duration}`}>
            <Clock3 size={19} />
            <div>
              <span>Days on contract</span>
              <strong>
                {contractClock(record as Project, today, regional.date).label}
              </strong>
              <p>
                {contractClock(record as Project, today, regional.date).detail}
              </p>
            </div>
          </div>
        )}
        {kind === "project" ? (
          <div className={styles.workSummary}>
            <span>
              <strong>{tasks.filter((t) => t.status === "Done").length}</strong>{" "}
              Completed
            </span>
            <span>
              <strong>{tasks.filter((t) => t.status !== "Done").length}</strong>{" "}
              Open work items
            </span>
            <button
              className="text-button link"
              onClick={() => onSection("Schedule")}
            >
              View all work <ArrowUpRight size={14} />
            </button>
          </div>
        ) : (
          <p>
            Build the estimate, collect the required signatures, and confirm the
            deposit before this job moves into Planning.
          </p>
        )}
      </section>
    </div>
  );
}
