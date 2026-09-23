"use client";
import { useState } from "react";
import {
  CalendarDays,
  List,
  Plus,
  Search,
  Check,
  Pencil,
  Trash2,
  Flag,
  ClipboardCheck,
  Truck,
  HardHat,
  CheckSquare,
  CalendarClock,
} from "lucide-react";
import {
  workTypes,
  type Project,
  type Task,
  type Workspace,
  type WorkType,
} from "@/lib/types";
import {
  calendarDate,
  calendarEntries,
  type CalendarEntry,
} from "@/lib/calendar";
import {
  entryTiming,
  entryType,
  groupUpcoming,
  workToday,
  type UpcomingView,
} from "@/lib/work";
import CalendarPanel from "./calendar-panel";
import { Badge } from "./ui";

const icons = {
  Task: CheckSquare,
  Inspection: ClipboardCheck,
  Delivery: Truck,
  "Contractor visit": HardHat,
  Milestone: Flag,
  Consultation: CalendarClock,
};

export default function UpcomingPanel({
  workspace,
  projectId,
  view,
  onViewChange,
  onEditTask,
  onEditProject,
  onOpenProject,
  onOpenLead,
  onAddWork,
  onToggleTask,
  onDeleteTask,
}: {
  workspace: Workspace;
  projectId?: string;
  view: UpcomingView;
  onViewChange: (view: UpcomingView) => void;
  onEditTask: (task: Task) => void;
  onEditProject: (project: Project) => void;
  onOpenProject?: (id: string) => void;
  onOpenLead?: (id: string) => void;
  onAddWork: (date?: string, projectId?: string, workType?: WorkType) => void;
  onToggleTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}) {
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [selectedDay, setSelectedDay] = useState(workToday);
  const scopedProject = projectId || projectFilter;
  const today = workToday();
  const entries = calendarEntries(workspace, scopedProject, true, true).filter(
    (entry) => {
      const contractor = workspace.contractors.find(
        (c) => c.id === entry.task?.contractorId,
      );
      return (
        (statusFilter === "All work" ||
          (statusFilter === "Completed"
            ? entry.completed
            : !entry.completed)) &&
        (typeFilter === "All types" || entryType(entry) === typeFilter) &&
        `${entry.title} ${entry.project?.name || ""} ${entry.contact?.address || ""} ${entry.contact?.phone || ""} ${entry.task?.description || ""} ${contractor?.name || ""} ${contractor?.company || ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      );
    },
  );
  const groups = groupUpcoming(entries, today);
  const hasFilters =
    query ||
    projectFilter ||
    typeFilter !== "All types" ||
    statusFilter !== "Open";
  function resetFilters() {
    setQuery("");
    setProjectFilter("");
    setTypeFilter("All types");
    setStatusFilter("Open");
  }
  function openEntry(entry: CalendarEntry) {
    if (entry.lead) onOpenLead?.(entry.lead.id);
    else if (entry.task) onEditTask(entry.task);
    else if (entry.project) onEditProject(entry.project);
  }

  return (
    <section
      className="upcoming-panel"
      aria-label={
        projectId ? "Project upcoming work" : "Workspace upcoming work"
      }
    >
      <div className="upcoming-toolbar">
        <div
          className="upcoming-view-toggle"
          role="group"
          aria-label="Upcoming view"
        >
          {(["List", "Calendar"] as const).map((mode) => {
            const Icon = mode === "List" ? List : CalendarDays;
            return (
              <button
                key={mode}
                aria-pressed={view === mode}
                onClick={() => onViewChange(mode)}
              >
                <Icon size={16} />
                {mode}
              </button>
            );
          })}
        </div>
        <button
          className="button primary"
          disabled={!workspace.projects.length}
          onClick={() =>
            onAddWork(
              view === "Calendar" ? selectedDay : undefined,
              scopedProject || undefined,
              workTypes.includes(typeFilter as WorkType)
                ? (typeFilter as WorkType)
                : undefined,
            )
          }
        >
          <Plus size={16} />
          Add work
        </button>
      </div>
      <div className="upcoming-filters">
        <label className="upcoming-search">
          <Search size={15} />
          <span className="sr-only">Search upcoming work</span>
          <input
            type="search"
            placeholder="Search work or contractor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!projectId && (
          <label>
            <span className="sr-only">Filter by project</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="">All projects</option>
              {workspace.projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="sr-only">Filter by work type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {["All types", ...workTypes, "Milestone"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Work status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {["Open", "Completed", "All work"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        {!!hasFilters && (
          <button className="text-button link" onClick={resetFilters}>
            Clear filters
          </button>
        )}
      </div>
      <p className="upcoming-context">
        Tasks, visits, and project milestones{" "}
        <span>· Times in Eastern Time</span>
      </p>
      {view === "Calendar" ? (
        <CalendarPanel
          workspace={workspace}
          projectId={projectId}
          entries={entries}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onEditTask={onEditTask}
          onEditProject={onEditProject}
          onOpenProject={onOpenProject}
          onOpenLead={onOpenLead}
          onToggleTask={onToggleTask}
        />
      ) : (
        <div className="upcoming-list">
          {!groups.length && (
            <div className="upcoming-empty">
              <CalendarDays size={25} />
              <h3>
                {!workspace.projects.length
                  ? "Create a project to start scheduling work"
                  : hasFilters
                    ? "No work matches these filters"
                    : "Your schedule is clear"}
              </h3>
              <p>
                {!workspace.projects.length
                  ? "Add your first project from Projects."
                  : hasFilters
                    ? "Try another project, type, or status."
                    : "Add a task, inspection, delivery, or contractor visit to get started."}
              </p>
            </div>
          )}
          {groups.map(([name, items]) => (
            <section
              className={`upcoming-group ${name === "Overdue" ? "upcoming-overdue" : ""}`}
              aria-label={name}
              key={name}
            >
              <div className="upcoming-group-heading">
                <h3>{name}</h3>
                <span>{items.length}</span>
              </div>
              <ul>
                {items.map((entry) => {
                  const type = entryType(entry);
                  const Icon = icons[type];
                  const contractor = workspace.contractors.find(
                    (c) => c.id === entry.task?.contractorId,
                  );
                  const date = entry.date
                    ? calendarDate(entry.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        ...(entry.date.slice(0, 4) !== today.slice(0, 4)
                          ? { year: "numeric" }
                          : {}),
                      })
                    : "No date";
                  return (
                    <li
                      key={entry.id}
                      className={`upcoming-row ${entry.completed ? "is-completed" : ""}`}
                    >
                      <div className="upcoming-date">
                        <strong>{name === "Today" ? "Today" : date}</strong>
                        <span>{entryTiming(entry)}</span>
                      </div>
                      <div className="upcoming-work-body">
                        <div className="upcoming-work-type">
                          <Icon size={13} />
                          {type}
                          {entry.task?.priority === "High" && (
                            <span className="upcoming-high-priority">
                              High priority
                            </span>
                          )}
                        </div>
                        <button
                          className="upcoming-work-title"
                          onClick={() => openEntry(entry)}
                        >
                          {entry.title}
                        </button>
                        <div className="upcoming-work-meta">
                          {!projectId &&
                            onOpenProject &&
                            (entry.project ? (
                              <button
                                onClick={() => onOpenProject(entry.project!.id)}
                              >
                                {entry.project.name}
                              </button>
                            ) : entry.lead ? (
                              <button
                                onClick={() => onOpenLead?.(entry.lead!.id)}
                              >
                                Lead · {entry.lead.name}
                              </button>
                            ) : null)}
                          {entry.task && (
                            <span>{contractor?.name || "Unassigned"}</span>
                          )}
                          {entry.task && <Badge status={entry.task.status} />}
                        </div>
                      </div>
                      <div className="upcoming-row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${entry.title}`}
                          onClick={() => openEntry(entry)}
                        >
                          <Pencil size={14} />
                        </button>
                        {entry.task && (
                          <>
                            <button
                              className="icon-button delete-action"
                              aria-label={`Delete ${entry.title}`}
                              onClick={() => onDeleteTask(entry.task!)}
                            >
                              <Trash2 size={14} />
                            </button>
                            <button
                              className={`task-check ${entry.completed ? "checked" : ""}`}
                              aria-label={`${entry.completed ? "Reopen" : "Complete"} ${entry.title}`}
                              onClick={() => onToggleTask(entry.task!)}
                            >
                              {entry.completed && <Check size={14} />}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
