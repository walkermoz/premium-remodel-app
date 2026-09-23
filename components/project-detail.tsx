"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Pencil,
  Plus,
  Download,
  CalendarDays,
  Clock3,
  ArrowUpRight,
  ListChecks,
  MessageSquare,
  ImageIcon,
  LayoutDashboard,
  TriangleAlert,
  StickyNote,
  Share2,
} from "lucide-react";
import type {
  Attachment,
  Entity,
  EntityKind,
  Project,
  ScopeItem,
  Task,
  User,
  Workspace,
} from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import {
  projectMoney as money,
  projectFinances,
  percentLabel,
  scopeDifference,
} from "@/lib/project-finances";
import TaskList from "./task-list";
import ScopeTable from "./scope-table";
import FilesPanel from "./files-panel";
import JobActivity from "./job-activity";
import ProjectPayments from "./project-payments";
import ProjectNotes from "./project-notes";
import type { Editor } from "./entity-form";
import UpcomingPanel from "./upcoming-panel";
import { workType, type UpcomingView } from "@/lib/work";
import { contractClock } from "@/lib/project-timing";
import ClientLinkDialog from "./client-link-dialog";

export const projectTabs = [
  "Overview",
  "Upcoming",
  "Scope & costs",
  "Notes",
  "Photos & files",
  "Activity",
] as const;
export type ProjectTab = (typeof projectTabs)[number];

export default function ProjectDetail({
  project,
  contractToday,
  workspace,
  user,
  demo,
  onBack,
  onEdit,
  onLogActivity,
  onLogPayment,
  onSave,
  onDelete,
  onUpload,
  onToggle,
  notify,
  tab,
  onTabChange: setTab,
  upcomingView,
  onUpcomingViewChange,
}: {
  project: Project;
  contractToday: string;
  workspace: Workspace;
  user: User;
  demo: boolean;
  onBack: () => void;
  onEdit: (editor: Editor) => void;
  onLogActivity: (projectId: string) => void;
  onLogPayment: (projectId: string) => void;
  onSave: (
    kind: EntityKind,
    data: Record<string, unknown>,
    entity?: Entity,
    requestId?: string,
  ) => Promise<void>;
  onDelete: (kind: EntityKind, entity: Entity) => void;
  onUpload: (file: File, projectId: string) => Promise<Attachment>;
  onToggle: (task: Task) => void;
  notify: (message: string, error?: boolean) => void;
  tab: ProjectTab;
  onTabChange: (tab: ProjectTab) => void;
  upcomingView: UpcomingView;
  onUpcomingViewChange: (view: UpcomingView) => void;
}) {
  const [clientLinkOpen, setClientLinkOpen] = useState(false);
  const clock = contractClock(project, contractToday);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = tabs.current;
    const active = container?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    if (!container || !active) return;
    const bounds = container.getBoundingClientRect(),
      selected = active.getBoundingClientRect();
    if (selected.right > bounds.right)
      container.scrollLeft += selected.right - bounds.right + 12;
    else if (selected.left < bounds.left)
      container.scrollLeft += selected.left - bounds.left - 12;
  }, [tab]);
  const items = workspace.scope.filter((i) => i.projectId === project.id);
  const tasks = workspace.tasks.filter((t) => t.projectId === project.id);
  const files = workspace.attachments.filter((f) => f.projectId === project.id);
  const comments = workspace.comments.filter((c) => c.projectId === project.id);
  const finances = projectFinances(project, items, workspace.activities);
  const {
    total: estimated,
    costs,
    subCosts,
    materialCosts,
    margin,
    legacyDifference,
  } = finances;
  const contractPercentage = percentLabel(finances.marginPercent);
  const done = tasks.filter((t) => t.status === "Done").length;
  const progress = tasks.length
    ? Math.round((done / tasks.length) * 100)
    : project.status === "Completed"
      ? 100
      : 0;
  const addScope = () => onEdit({ kind: "scope", projectId: project.id });
  const addTask = () => onEdit({ kind: "task", projectId: project.id });
  function exportSheet() {
    const rows: (string | number)[][] = [
      ["JOB MASTER SHEET"],
      ["Project", project.name],
      ["Address", project.address],
      ["Client", project.client],
      ["Scope total / project price", estimated],
      ...(legacyDifference
        ? [
            [
              "Previous contract amount (reference only)",
              project.contractPrice ?? "",
            ],
            ["Scope difference", legacyDifference],
          ]
        : []),
      ["Collected", finances.collected],
      ["Remaining to collect", finances.remaining],
      ["Collected percentage", percentLabel(finances.collectedPercent)],
      ["Remaining percentage", percentLabel(finances.remainingPercent)],
      ["Overpayment", finances.credit],
      ["Start date", project.startDate],
      ["Target completion", project.endDate],
      ["Actual completion", project.completedDate || ""],
      ["Days on contract", clock.days ?? ""],
      ["Status", project.status],
      ["Full scope of work", project.description],
      [],
      [
        "Work item",
        "Quantity",
        "Unit",
        "Price",
        "Subcontractor cost",
        "Material cost",
        "Difference",
        "Contractor",
        "Status",
      ],
      ...items.map((i) => [
        i.title,
        i.quantity,
        i.unit,
        i.estimate,
        i.subCost,
        i.materialCost ?? 0,
        scopeDifference(i),
        workspace.contractors.find((c) => c.id === i.contractorId)?.name ||
          "Unassigned",
        i.status,
      ]),
      ["TOTAL", "", "", estimated, subCosts, materialCosts, margin],
      [],
      [
        "Work",
        "Type",
        "Contractor",
        "Date",
        "Start time (Eastern)",
        "End time (Eastern)",
        "Priority",
        "Status",
        "Notes",
      ],
      ...tasks.map((t) => [
        t.title,
        workType(t),
        workspace.contractors.find((c) => c.id === t.contractorId)?.name ||
          "Unassigned",
        t.dueDate,
        t.startTime || "",
        t.endTime || "",
        t.priority,
        t.status,
        t.description,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((v) => {
            const text =
              typeof v === "string" && /^[\s]*[=+@\-]/.test(v)
                ? `'${v}`
                : String(v);
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9]+/g, "-")}-job-master.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Job master sheet exported");
  }
  const scopeTable = (
    <ScopeTable
      items={items}
      workspace={workspace}
      onAdd={addScope}
      onEdit={(item: ScopeItem) => onEdit({ kind: "scope", entity: item })}
      onDelete={(item) => onDelete("scope", item)}
    />
  );
  const taskList = (limited: boolean) => (
    <TaskList
      tasks={
        limited
          ? tasks
              .filter((task) => task.status !== "Done")
              .sort(
                (a, b) =>
                  (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
                  (a.startTime || "99:99").localeCompare(
                    b.startTime || "99:99",
                  ),
              )
              .slice(0, 5)
          : tasks
      }
      workspace={workspace}
      compact={limited}
      onAdd={addTask}
      onEdit={(task) => onEdit({ kind: "task", entity: task })}
      onToggle={onToggle}
      onDelete={(task) => onDelete("task", task)}
    />
  );
  return (
    <div className="project-detail">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        All projects
      </button>
      <div className="project-heading">
        <div>
          <h1>{project.name}</h1>
          <div className="project-address">
            <MapPin size={15} />
            {project.address || "No address added"}
            <span className="address-divider">·</span>
            {project.client || "No client added"}
          </div>
        </div>
        <div className="project-actions">
          {user.role === "admin" && !demo && (
            <button
              className="button secondary"
              onClick={() => setClientLinkOpen(true)}
            >
              <Share2 size={15} />
              <span>Client link</span>
            </button>
          )}
          <button className="button secondary" onClick={exportSheet}>
            <Download size={15} />
            <span>Export sheet</span>
          </button>
          <button
            className="button primary"
            onClick={() => onEdit({ kind: "project", entity: project })}
          >
            <Pencil size={15} />
            Edit project
          </button>
        </div>
      </div>
      {clientLinkOpen && (
        <ClientLinkDialog
          project={project}
          onClose={() => setClientLinkOpen(false)}
          notify={notify}
        />
      )}
      <div className="project-status-line">
        <span className="badge badge-category">
          {project.category || "Remodel"}
        </span>
        <label className="sr-only" htmlFor="project-status">
          Project status
        </label>
        <select
          id="project-status"
          className={`inline-status status-${project.status.toLowerCase().replaceAll(" ", "-")}`}
          value={project.status}
          onChange={(e) =>
            void onSave(
              "project",
              { ...project, status: e.target.value },
              project,
            ).catch((err) => notify(err.message, true))
          }
        >
          {["Planning", "In progress", "On hold", "Completed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="muted">
          {done} of {tasks.length} work items complete
        </span>
        <span className="mini-progress">
          <i style={{ width: `${progress}%` }} />
        </span>
        <strong>{progress}%</strong>
      </div>
      <div className="project-contract-clock">
        <Clock3 size={21} aria-hidden="true" />
        <div>
          <span>Days on contract</span>
          <strong>{clock.label}</strong>
          <p>{clock.detail}</p>
        </div>
      </div>
      <div className="detail-metrics scope-metrics">
        <div>
          <span>Scope total · project price</span>
          <strong>{money(estimated)}</strong>
          <small>{items.length} work items</small>
          {legacyDifference !== 0 && (
            <p className="scope-price-warning">
              <TriangleAlert size={14} aria-hidden="true" />
              <span>
                Scope is {money(Math.abs(legacyDifference))}{" "}
                {legacyDifference > 0 ? "above" : "below"} the previous contract
                amount of {money(project.contractPrice!)}.
              </span>
            </p>
          )}
        </div>
        <div>
          <span>Budgeted costs</span>
          <strong>{money(costs)}</strong>
          <small>Subcontractors · {money(subCosts)}</small>
          <small>Materials · {money(materialCosts)}</small>
        </div>
        <div>
          <span>Scope less costs</span>
          <div className="metric-value-row">
            <strong className={margin < 0 ? "is-overdue" : ""}>
              {money(margin)}
            </strong>
            <span
              className={`metric-percentage ${margin < 0 ? "is-negative" : ""}`}
              title={
                estimated > 0
                  ? "Percentage of scope total remaining after subcontractor and material costs, before other project expenses"
                  : "Add scope pricing to calculate the percentage"
              }
              aria-label={
                estimated > 0
                  ? `${contractPercentage} of scope total, before other project expenses`
                  : "Percentage unavailable until scope pricing is added"
              }
            >
              {contractPercentage}
            </span>
          </div>
          <small>Before other project expenses</small>
        </div>
      </div>
      <div ref={tabs} className="detail-tabs" role="tablist">
        {[
          { name: "Overview", icon: LayoutDashboard },
          {
            name: "Upcoming",
            icon: CalendarDays,
            count: tasks.filter((t) => t.status !== "Done").length,
          },
          { name: "Scope & costs", icon: ListChecks, count: items.length },
          { name: "Notes", icon: StickyNote, count: comments.length },
          { name: "Photos & files", icon: ImageIcon, count: files.length },
          {
            name: "Activity",
            icon: MessageSquare,
            count:
              comments.length +
              (workspace.activities || []).filter(
                (item) => item.projectId === project.id,
              ).length,
          },
        ].map((t) => (
          <button
            key={t.name}
            role="tab"
            aria-selected={tab === t.name}
            className={tab === t.name ? "active" : ""}
            onClick={() => setTab(t.name as ProjectTab)}
          >
            <t.icon size={16} />
            {t.name}
            {t.count !== undefined && <span>{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="detail-tab-content" role="tabpanel" aria-label={tab}>
        <div hidden={tab !== "Notes"}>
          <ProjectNotes
            comments={comments}
            files={files}
            demo={demo}
            user={user}
            onUpload={(file) => onUpload(file, project.id)}
            onPost={(body, attachmentIds, requestId) =>
              onSave(
                "comment",
                { projectId: project.id, body, attachmentIds },
                undefined,
                requestId,
              )
            }
            onDelete={(comment) => onDelete("comment", comment)}
          />
        </div>
        {tab === "Overview" && (
          <>
            <ProjectPayments
              project={project}
              workspace={workspace}
              demo={demo}
              onLog={() => onLogPayment(project.id)}
            />
            <div className="overview-columns">
              <section className="project-brief">
                <div className="section-heading">
                  <h2>Project brief</h2>
                  <button
                    className="icon-button"
                    onClick={() => onEdit({ kind: "project", entity: project })}
                    aria-label="Edit project brief"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                <p className="scope-description">
                  {project.description ||
                    "No scope description yet. Edit the project to add the full scope of work."}
                </p>
              </section>
              <aside className="project-facts">
                <div>
                  <CalendarDays size={18} />
                  <span>
                    Start date<strong>{dateLabel(project.startDate)}</strong>
                  </span>
                </div>
                <div>
                  <CalendarDays size={18} />
                  <span>
                    Target completion
                    <strong>{dateLabel(project.endDate)}</strong>
                  </span>
                </div>
                {project.completedDate && (
                  <div>
                    <CalendarDays size={18} />
                    <span>
                      Actual completion
                      <strong>{dateLabel(project.completedDate)}</strong>
                    </span>
                  </div>
                )}
              </aside>
            </div>
            <section className="content-section">
              <div className="section-heading">
                <div>
                  <h2>
                    Scope of work{" "}
                    <span className="count-pill">{items.length}</span>
                  </h2>
                  <p>Your job master sheet, broken down by work item.</p>
                </div>
                <button
                  className="button secondary small-button"
                  onClick={addScope}
                >
                  <Plus size={15} />
                  Add item
                </button>
              </div>
              {scopeTable}
            </section>
            <section className="content-section">
              <div className="section-heading">
                <h2>
                  Upcoming work{" "}
                  <span className="count-pill">
                    {tasks.filter((task) => task.status !== "Done").length}
                  </span>
                </h2>
                <button
                  className="text-button link"
                  onClick={() => setTab("Upcoming")}
                >
                  View upcoming work
                  <ArrowUpRight size={15} />
                </button>
              </div>
              {taskList(true)}
            </section>
          </>
        )}
        {tab === "Upcoming" && (
          <UpcomingPanel
            workspace={workspace}
            projectId={project.id}
            view={upcomingView}
            onViewChange={onUpcomingViewChange}
            onEditTask={(task) => onEdit({ kind: "task", entity: task })}
            onEditProject={(project) =>
              onEdit({ kind: "project", entity: project })
            }
            onAddWork={(dueDate, _projectId, workType) =>
              onEdit({ kind: "task", projectId: project.id, dueDate, workType })
            }
            onToggleTask={onToggle}
            onDeleteTask={(task) => onDelete("task", task)}
          />
        )}
        {tab === "Scope & costs" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Scope & cost breakdown</h2>
                <p>Amounts are totals for each work item, not unit prices.</p>
              </div>
              <button className="button primary" onClick={addScope}>
                <Plus size={16} />
                Add scope item
              </button>
            </div>
            {scopeTable}
            <p className="footnote">
              “Difference” is the item’s price less its subcontractor and
              material costs, before other labor, overhead, or taxes. Material
              cost excludes materials already included in the subcontractor
              cost.
            </p>
          </>
        )}
        {tab === "Photos & files" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Photos & files</h2>
                <p>
                  Progress photos and project documents, shared with your team.
                </p>
              </div>
              <span className="muted">{files.length} files</span>
            </div>
            <FilesPanel
              files={files}
              coverId={project.coverAttachmentId}
              onUpload={async (file) => {
                await onUpload(file, project.id);
              }}
              onSetCover={async (file) => {
                await onSave(
                  "project",
                  { ...project, coverAttachmentId: file.id },
                  project,
                );
              }}
              onDelete={(file: Attachment) => onDelete("attachment", file)}
              admin={user.role === "admin"}
              demo={demo}
            />
          </>
        )}
        {tab === "Activity" && (
          <JobActivity
            workspace={workspace}
            user={user}
            demo={demo}
            projectId={project.id}
            onLog={() => onLogActivity(project.id)}
            onDelete={onDelete}
            onTask={(task) => onEdit({ kind: "task", entity: task })}
          />
        )}
      </div>
    </div>
  );
}
