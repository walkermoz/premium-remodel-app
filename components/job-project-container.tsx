"use client";
import type { Project, Workspace } from "@/lib/types";
import { scopeTotal } from "@/lib/project-finances";
import { useRegionalFormat } from "./regional-format-context";
import styles from "./job-workspace.module.css";
export default function JobProjectContainer({
  project,
  workspace,
  onBack,
  onOpen,
  onNewJob,
  onEdit,
}: {
  project: Project;
  workspace: Workspace;
  onBack: () => void;
  onOpen: (id: string) => void;
  onNewJob: () => void;
  onEdit: () => void;
}) {
  const regional = useRegionalFormat();
  const jobs = workspace.projects.filter(
    (job) => job.parentProjectId === project.id && job.recordType !== "project",
  );
  return (
    <section className={styles.estimateEditor}>
      <button className="back-link" onClick={onBack}>
        ← All jobs & projects
      </button>
      <header className={styles.sectionHeading}>
        <div>
          <small>PROJECT</small>
          <h1>{project.name}</h1>
          <p>
            {project.client} · {project.address}
          </p>
        </div>
        <div className={styles.recordActions}>
          <button className="button secondary" onClick={onEdit}>
            Edit project
          </button>
          <button className="button primary" onClick={onNewJob}>
            Book job in project
          </button>
        </div>
      </header>
      <p>{project.description}</p>
      <h2>Jobs & appointments</h2>
      <p>
        A project groups its jobs. Each job retains its own estimate options,
        invoice, forms, and closeout.
      </p>
      {jobs.map((job) => (
        <button
          className={styles.sectionLink}
          key={job.id}
          onClick={() => onOpen(job.id)}
        >
          <span>
            <strong>{job.name}</strong>
            <small>
              {job.status} · {job.job?.appointments.length || 0} appointments
            </small>
          </span>
          <span>{regional.money(scopeTotal(workspace.scope, job.id))} →</span>
        </button>
      ))}
      {!jobs.length && (
        <p className={styles.emptyLine}>No jobs booked in this project yet.</p>
      )}
    </section>
  );
}
