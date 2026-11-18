"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  Wrench,
  MapPin,
  ClipboardList,
  ReceiptText,
  CalendarDays,
  StickyNote,
  ImageIcon,
  ClipboardCheck,
  History,
  FileCheck2,
  ChevronRight,
} from "lucide-react";
import type { Project, Quote, Workspace } from "@/lib/types";
import { nextJobTask, type JobSection } from "@/lib/job-workspace";
import { workToday } from "@/lib/work";
import { useRegionalFormat } from "./regional-format-context";
import styles from "./job-workspace.module.css";

const sections = [
  { name: "Job", icon: Wrench },
  { name: "History", icon: History },
  { name: "Forms", icon: FileCheck2 },
  { name: "Estimates", icon: ClipboardList },
  { name: "Invoice", icon: ReceiptText },
  { name: "Schedule", icon: CalendarDays },
  { name: "Notes", icon: StickyNote },
  { name: "Photos & files", icon: ImageIcon },
  { name: "Closeout", icon: ClipboardCheck },
] as const;

export default function JobWorkspaceShell({
  record,
  kind,
  workspace,
  section,
  onSection,
  onBack,
  actions,
  children,
}: {
  record: Project | Quote;
  kind: "project" | "quote";
  workspace: Workspace;
  section: JobSection;
  onSection: (section: JobSection) => void;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const regional = useRegionalFormat();
  const tasks = workspace.tasks.filter(
    (task) => task.projectId === record.id && task.status !== "Done",
  );
  const today = workToday(new Date(), regional.timezone);
  const next = kind === "project" ? nextJobTask(tasks, today) : undefined;
  return (
    <div className={styles.workspace}>
      <nav className={styles.rail} aria-label="Job navigation">
        <button
          className={styles.railBack}
          onClick={onBack}
          title="All jobs"
          aria-label="Back to all jobs"
        >
          <ArrowLeft size={21} />
          <span>All jobs</span>
        </button>
        {sections
          .filter((item) => kind === "project" || item.name !== "Schedule")
          .map((item) => (
            <button
              key={item.name}
              aria-label={item.name}
              className={section === item.name ? styles.selected : ""}
              aria-current={section === item.name ? "page" : undefined}
              onClick={() => onSection(item.name)}
            >
              <item.icon size={22} strokeWidth={1.65} />
              <span>{item.name}</span>
              {item.name === "Notes" &&
                workspace.comments.some(
                  (note) => note.projectId === record.id,
                ) && <i aria-label="Has notes" />}
            </button>
          ))}
      </nav>
      <div className={styles.main}>
        <header className={styles.topline}>
          <button onClick={onBack}>
            <ArrowLeft size={15} /> All jobs
          </button>
          <strong>{section}</strong>
          <span>{kind === "quote" ? "Estimating" : record.status}</span>
        </header>
        <div className={styles.context}>
          <div>
            <span className={styles.eyebrow}>
              JOB #{record.quoteNumber || record.id.slice(0, 8).toUpperCase()}
            </span>
            <h1>{record.name}</h1>
          </div>
          <div className={styles.contextAction}>{actions}</div>
        </div>
        <div className={styles.customerStrip} data-testid="job-customer">
          <div>
            <small>LOCATION / BILL TO</small>
            <strong>{record.client || "Customer not added"}</strong>
            <span>
              <MapPin size={13} />
              {record.address || "Address not added"}
            </span>
          </div>
          <div>
            <small>{kind === "quote" ? "ESTIMATE STATUS" : "JOB TYPE"}</small>
            <strong>
              {kind === "quote"
                ? record.status
                : record.category || "Remodeling"}
            </strong>
            <span>
              {kind === "quote"
                ? record.category || "Remodeling"
                : `${tasks.length} open work items`}
            </span>
          </div>
          <div>
            <small>
              {next
                ? next.dueDate < today
                  ? "OVERDUE WORK"
                  : "NEXT SCHEDULED WORK"
                : "START DATE"}
            </small>
            <strong>
              {next
                ? regional.date(next.dueDate)
                : record.startDate
                  ? regional.date(record.startDate)
                  : "Not scheduled"}
            </strong>
            <span>
              {next?.title ||
                (record.endDate
                  ? `Target completion ${regional.date(record.endDate)}`
                  : "Set dates in job details")}
            </span>
          </div>
          {(record.clientPhone || record.clientEmail) && (
            <div className={styles.contactLinks}>
              <small>CONTACT DETAILS</small>
              {record.clientPhone && (
                <a href={`tel:${record.clientPhone.replace(/[^+\d]/g, "")}`}>
                  {record.clientPhone}
                </a>
              )}
              {record.clientEmail && (
                <a href={`mailto:${record.clientEmail}`}>
                  {record.clientEmail}
                </a>
              )}
            </div>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

export function JobSectionLink({
  title,
  detail,
  value,
  onClick,
}: {
  title: string;
  detail?: string;
  value?: string | number;
  onClick: () => void;
}) {
  return (
    <button className={styles.sectionLink} onClick={onClick}>
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <span>
        {value}
        <ChevronRight size={16} />
      </span>
    </button>
  );
}
