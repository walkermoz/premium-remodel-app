"use client";
import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";
import type { Project, Workspace } from "@/lib/types";
import type { JobSection } from "@/lib/job-workspace";
import { projectFinances } from "@/lib/project-finances";
import { useRegionalFormat } from "./regional-format-context";
import styles from "./job-workspace.module.css";

export default function JobCloseout({
  project,
  workspace,
  onSection,
  onEdit,
  onComplete,
}: {
  project: Project;
  workspace: Workspace;
  onSection: (section: JobSection) => void;
  onEdit: () => void;
  onComplete: () => Promise<void>;
}) {
  const regional = useRegionalFormat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = workspace.tasks.filter(
    (task) => task.projectId === project.id && task.status !== "Done",
  ).length;
  const balance = projectFinances(
    project,
    workspace.scope,
    workspace.activities,
  ).remaining;
  const checks = [
    {
      title: "Payments",
      ready: balance <= 0,
      detail:
        balance > 0
          ? `${regional.money(balance)} remains to collect`
          : "No outstanding balance",
      section: "Invoice" as const,
    },
    {
      title: "Signatures",
      ready: !project.msaAgreement || project.msaAgreement.status === "signed",
      detail: project.msaAgreement
        ? project.msaAgreement.status === "signed"
          ? "Agreement signed"
          : "Agreement signature is still pending"
        : "No agreement is attached to this job",
      section: "Forms" as const,
    },
    {
      title: "Scheduled work",
      ready: open === 0,
      detail: open
        ? `${open} work ${open === 1 ? "item remains" : "items remain"}`
        : "All recorded work is complete",
      section: "Schedule" as const,
    },
    {
      title: "Work summary",
      ready: Boolean(project.description.trim()),
      detail: project.description || "Add the work summary to the job details",
      section: "Job" as const,
    },
  ];
  const complete = project.status === "Completed";
  return (
    <section>
      <header className={styles.sectionHeading}>
        <div>
          <h2>Job closeout</h2>
          <p>
            Review the work, signatures, and payments before completing this
            job.
          </p>
        </div>
        <ClipboardCheck size={23} />
      </header>
      <div className={styles.reviewList}>
        {checks.map((check) => (
          <div className={styles.reviewRow} key={check.title}>
            {check.ready ? (
              <CheckCircle2 size={19} className={styles.ready} />
            ) : (
              <CircleAlert size={19} className={styles.pending} />
            )}
            <div>
              <h3>{check.title}</h3>
              <p>{check.detail}</p>
            </div>
            <button
              className="text-button link"
              onClick={
                check.title === "Work summary"
                  ? onEdit
                  : () => onSection(check.section)
              }
            >
              Review <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={complete || busy || checks.some((check) => !check.ready)}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onComplete();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not complete this job.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <CheckCircle2 size={16} />
        {complete ? "Job completed" : busy ? "Completing…" : "Complete job"}
      </button>
      {!complete && checks.some((check) => !check.ready) && (
        <p className={styles.emptyLine}>
          Resolve the open items above to complete the job from this checklist.
        </p>
      )}
    </section>
  );
}
