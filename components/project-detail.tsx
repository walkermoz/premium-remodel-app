"use client";
import { useState } from "react";
import { Pencil, Plus, Download, ArrowUpRight, Share2 } from "lucide-react";
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
import { projectFinances, scopeDifference } from "@/lib/project-finances";
import TaskList from "./task-list";
import ScopeTable from "./scope-table";
import FilesPanel from "./files-panel";
import JobActivity from "./job-activity";
import ProjectPayments from "./project-payments";
import ProjectNotes from "./project-notes";
import type { Editor } from "./entity-form";
import UpcomingPanel from "./upcoming-panel";
import { timeLabel, workType, type UpcomingView } from "@/lib/work";
import { contractClock } from "@/lib/project-timing";
import ClientLinkDialog from "./client-link-dialog";
import MsaDraftPanel from "./msa-draft-panel";
import { useRegionalFormat } from "./regional-format-context";
import JobWorkspaceShell from "./job-workspace-shell";
import JobOverview from "./job-overview";
import JobHistory from "./job-history";
import {
  JobAppointments,
  JobEstimates,
  JobForms,
  JobInvoice,
  JobOperationalCloseout,
  type JobOperationInput,
} from "./job-operational-panels";
import type { JobSection } from "@/lib/job-workspace";
import { canOpenWorkspaceTab } from "@/lib/workspace-tab-access";
import { useBusinessConfig } from "./business-context";
import jobStyles from "./job-workspace.module.css";

export const projectTabs = [
  "Overview",
  "Upcoming",
  "Scope & costs",
  "Contracts",
  "Notes",
  "Photos & files",
  "Activity",
  "History",
  "Estimates",
  "Invoice",
  "Closeout",
] as const;
export type ProjectTab = (typeof projectTabs)[number];

export default function ProjectDetail({
  project,
  contractToday,
  workspace,
  user,
  demo,
  onBack,
  onOpenRecord,
  onJobAction,
  onNewEstimate,
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
  onJobAction: (action: JobOperationInput) => Promise<void>;
  onNewEstimate: () => void;
  onOpenRecord?: (kind: "quote" | "project", id: string) => void;
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
  const regional = useRegionalFormat();
  const percent = (value: number | null) =>
    value === null
      ? "—"
      : regional.number(value, {
          style: "percent",
          maximumFractionDigits: 1,
        });
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [quoteLinkOpen, setQuoteLinkOpen] = useState(false);
  const clock = contractClock(project, contractToday, (value) =>
    regional.date(value),
  );
  const items = workspace.scope.filter((i) => i.projectId === project.id);
  const tasks = workspace.tasks.filter((t) => t.projectId === project.id);
  const files = workspace.attachments.filter((f) => f.projectId === project.id);
  const comments = workspace.comments.filter((c) => c.projectId === project.id);
  const finances = projectFinances(project, items, workspace.activities);
  const {
    total: estimated,
    subCosts,
    materialCosts,
    margin,
    legacyDifference,
  } = finances;

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
      ["Collected percentage", percent(finances.collectedPercent)],
      ["Remaining percentage", percent(finances.remainingPercent)],
      ["Overpayment", finances.credit],
      ["Start date", project.startDate],
      ["Target completion", project.endDate],
      ["Actual completion", project.completedDate || ""],
      ["Days on contract", clock.days ?? ""],
      ["Status", project.status],
      ["Full scope of work", project.description],
      [],
      [
        "Project section",
        "Item",
        "Scope details",
        "Quantity",
        "Unit",
        "Price",
        "Subcontractor cost",
        "Material cost",
        "Profit",
        "Contractor",
        "Status",
      ],
      ...items.map((i) => [
        i.sectionName || project.category || "General scope",
        i.title,
        i.details || "",
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
      [
        "TOTAL",
        "",
        "",
        "",
        "",
        estimated,
        subCosts,
        materialCosts,
        margin,
        "",
        "",
      ],
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
  const invoiceLocked =
    project.status === "Completed" ||
    project.job?.invoice.status === "Finalized";
  const bookedEstimates = (workspace.quotes || []).filter(
    (quote) => quote.jobId === project.id && quote.bookedJobId === project.id,
  );
  const scopeTable = invoiceLocked ? (
    <section aria-label="Locked invoice items">
      <p className="muted">
        The invoice is locked. Return to Invoice and reopen it before changing
        items.
      </p>
      {items.map((item) => (
        <div className={jobStyles.reviewRow} key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.details}</p>
          </div>
          <strong>{regional.money(item.estimate)}</strong>
        </div>
      ))}
    </section>
  ) : (
    <ScopeTable
      items={items}
      workspace={workspace}
      onAdd={addScope}
      onEdit={(item: ScopeItem) => onEdit({ kind: "scope", entity: item })}
      onDelete={(item) => onDelete("scope", item)}
      defaultSectionName={project.category || "General scope"}
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
      readOnly={project.status === "Completed"}
      onAdd={addTask}
      onEdit={(task) => onEdit({ kind: "task", entity: task })}
      onToggle={onToggle}
      onDelete={(task) => onDelete("task", task)}
    />
  );
  const config = useBusinessConfig();
  const tabSections: Record<ProjectTab, JobSection> = {
    Overview: "Job",
    Upcoming: "Schedule",
    "Scope & costs": "Invoice",
    Contracts: "Forms",
    Notes: "Notes",
    "Photos & files": "Photos & files",
    Activity: "History",
    History: "History",
    Estimates: "Estimates",
    Invoice: "Invoice",
    Closeout: "Closeout",
  };
  function selectJobSection(section: JobSection) {
    const map: Record<JobSection, ProjectTab> = {
      Job: "Overview",
      History: "History",
      Forms: "Contracts",
      Estimates: "Estimates",
      Invoice: "Invoice",
      Schedule: "Upcoming",
      Notes: "Notes",
      "Photos & files": "Photos & files",
      Closeout: "Closeout",
    };
    setTab(map[section]);
  }
  return (
    <JobWorkspaceShell
      record={project}
      kind="project"
      workspace={workspace}
      section={tabSections[tab]}
      onSection={selectJobSection}
      onBack={onBack}
      actions={
        <div className={jobStyles.recordActions}>
          <select
            aria-label="Project status"
            className={`inline-status status-${project.status.toLowerCase().replaceAll(" ", "-")}`}
            value={project.status}
            onChange={(event) =>
              event.target.value === "Completed"
                ? setTab("Closeout")
                : void onSave(
                    "project",
                    { ...project, status: event.target.value },
                    project,
                  ).catch((error) => notify(error.message, true))
            }
          >
            {["Planning", "In progress", "On hold", "Completed"].map(
              (status) => (
                <option key={status}>{status}</option>
              ),
            )}
          </select>
          {user.role === "admin" && !demo && (
            <button
              className="button secondary small-button"
              onClick={() => setQuoteLinkOpen(true)}
            >
              <Share2 size={15} /> Customer portal URL
            </button>
          )}
          <button
            className="button secondary small-button"
            onClick={exportSheet}
          >
            <Download size={15} /> Export sheet
          </button>
          <button
            className="button primary small-button"
            onClick={() => onEdit({ kind: "project", entity: project })}
          >
            <Pencil size={15} /> Edit job
          </button>
        </div>
      }
    >
      {quoteLinkOpen && (
        <ClientLinkDialog
          project={project}
          kind="project"
          onClose={() => setQuoteLinkOpen(false)}
          notify={notify}
        />
      )}
      {tab === "Overview" && (
        <>
          <JobOverview
            record={project}
            kind="project"
            workspace={workspace}
            onSection={selectJobSection}
            onEdit={() => onEdit({ kind: "project", entity: project })}
          />
          <section className={jobStyles.summarySection}>
            <div className="section-heading">
              <h3>Upcoming work</h3>
              <button
                className="text-button link"
                onClick={() => setTab("Upcoming")}
              >
                View upcoming work <ArrowUpRight size={15} />
              </button>
            </div>
            {taskList(true)}
          </section>
        </>
      )}
      {(tab === "History" || tab === "Activity") && (
        <JobHistory
          record={project}
          workspace={workspace}
          demo={demo}
          onLog={() => onLogActivity(project.id)}
          onOpen={onOpenRecord}
          canQuotes={Boolean(
            config && canOpenWorkspaceTab(config, user.group, "Quotes"),
          )}
        />
      )}
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

        {tab === "Estimates" && (
          <JobEstimates
            project={project}
            workspace={workspace}
            onNew={onNewEstimate}
            onOpen={(id) => onOpenRecord?.("quote", id)}
            onSave={async (quote, data) => onSave("quote", data, quote)}
            onAction={onJobAction}
            canOpen={Boolean(
              config && canOpenWorkspaceTab(config, user.group, "Quotes"),
            )}
            canEdit={Boolean(
              project.status !== "Completed" &&
              config &&
              canOpenWorkspaceTab(config, user.group, "Quotes"),
            )}
          />
        )}
        {tab === "Invoice" && (
          <JobInvoice
            key={`${project.id}:${project.job?.invoice.status}`}
            project={project}
            workspace={workspace}
            onAction={onJobAction}
            onSection={selectJobSection}
            onEditItems={() => setTab("Scope & costs")}
            onPayment={onLogPayment}
            onEstimate={(id) => onOpenRecord?.("quote", id)}
            demo={demo}
            admin={user.role === "admin"}
          />
        )}
        {tab === "Closeout" && (
          <JobOperationalCloseout
            project={project}
            workspace={workspace}
            onAction={onJobAction}
            onSection={selectJobSection}
          />
        )}
        {tab === "Contracts" && (
          <JobForms
            project={project}
            onAction={onJobAction}
            onAgreement={() => setAgreementOpen(!agreementOpen)}
          />
        )}
        {tab === "Contracts" && agreementOpen && (
          <>
            {bookedEstimates.length > 0 && (
              <section aria-label="Booked agreements">
                <h2>Services agreements & signatures</h2>
                {bookedEstimates.map((quote) => (
                  <button
                    className={jobStyles.sectionLink}
                    key={quote.id}
                    disabled={
                      !config ||
                      !canOpenWorkspaceTab(config, user.group, "Quotes")
                    }
                    onClick={() => onOpenRecord?.("quote", quote.id)}
                  >
                    <span>
                      <strong>
                        Estimate #{quote.quoteNumber} · {quote.name}
                      </strong>
                      <small>
                        {quote.msaAgreement?.status === "signed"
                          ? "Signed services agreement"
                          : "Review services agreement"}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </section>
            )}
            {project.quoteAcceptedAt && (
              <MsaDraftPanel
                key={`${project.id}:${JSON.stringify(project.msaPaymentSchedule)}:${project.msaPermitResponsibility || ""}:${JSON.stringify(project.msaContractTerms)}`}
                project={project}
                items={items}
                signer={user}
                demo={demo}
                onSaveTerms={(terms) =>
                  onSave("project", { ...project, ...terms }, project)
                }
              />
            )}
            {!bookedEstimates.length && !project.quoteAcceptedAt && (
              <section className="content-section" aria-label="Contracts">
                <div className="section-heading">
                  <div>
                    <h2>Master services agreement</h2>
                    <p>
                      Agreements and signed contract documents will appear here
                      after the quote is accepted.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        {tab === "Upcoming" && (
          <>
            <JobAppointments project={project} onAction={onJobAction} />
            {project.smsScheduleEnabled && (
              <p className="muted">
                Homeowner texts for scheduled work items ·{" "}
                {timeLabel(project.smsScheduleTime || "09:00")}
              </p>
            )}
            <UpcomingPanel
              onOpenAppointment={() =>
                document
                  .querySelector('[aria-label="Job appointments"]')
                  ?.scrollIntoView({ block: "start", behavior: "smooth" })
              }
              workspace={workspace}
              projectId={project.id}
              view={upcomingView}
              onViewChange={onUpcomingViewChange}
              onEditTask={(task) => onEdit({ kind: "task", entity: task })}
              onEditProject={(project) =>
                onEdit({ kind: "project", entity: project })
              }
              onAddWork={(dueDate, _projectId, workType) =>
                onEdit({
                  kind: "task",
                  projectId: project.id,
                  dueDate,
                  workType,
                })
              }
              onToggleTask={onToggle}
              onDeleteTask={(task) => onDelete("task", task)}
            />
          </>
        )}
        {tab === "Scope & costs" && (
          <>
            <button className="back-link" onClick={() => setTab("Invoice")}>
              ← Back to invoice
            </button>
            <ProjectPayments
              project={project}
              workspace={workspace}
              demo={demo}
              onLog={() => onLogPayment(project.id)}
              canCreateCardLink={user.role === "admin" && !demo}
            />
            <div className="detail-metrics scope-metrics">
              <div>
                <span>Invoice total</span>
                <strong>{regional.money(estimated)}</strong>
              </div>
              <div>
                <span>Budgeted costs</span>
                <strong>{regional.money(finances.costs)}</strong>
                <small>Subcontractors · {regional.money(subCosts)}</small>
                <small>Materials · {regional.money(materialCosts)}</small>
              </div>
              <div>
                <span>Scope less costs</span>
                <strong>{regional.money(margin)}</strong>
                <span className="metric-percentage">
                  {percent(finances.marginPercent)}
                </span>
              </div>
            </div>
            <div className="section-heading">
              <div>
                <h2>Scope & cost breakdown</h2>
                <p>Amounts are totals for each item, not unit prices.</p>
              </div>
              <button
                className="button primary"
                onClick={addScope}
                disabled={invoiceLocked}
              >
                <Plus size={16} />
                Add item
              </button>
            </div>
            {scopeTable}
            <p className="footnote">
              “Profit” is the item’s price less its subcontractor and material
              costs, before other labor, overhead, or taxes. Material cost
              excludes materials already included in the subcontractor cost.
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
    </JobWorkspaceShell>
  );
}
