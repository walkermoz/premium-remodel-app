"use client";
import { Check, CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import type { Task, Workspace } from "@/lib/types";
import { dateLabel, overdue } from "@/lib/utils";
import { Avatar, Badge, Empty } from "./ui";
import { workType, workTime } from "@/lib/work";
export default function TaskList({
  tasks,
  workspace,
  onEdit,
  onToggle,
  onDelete,
  onAdd,
  onProject,
  compact = false,
}: {
  tasks: Task[];
  workspace: Workspace;
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAdd: () => void;
  onProject?: (id: string) => void;
  compact?: boolean;
}) {
  if (!tasks.length)
    return (
      <Empty
        title="Your upcoming work is clear"
        text="Add the next steps and assign them to your contractors."
        action={
          <button className="button secondary" onClick={onAdd}>
            <Plus size={16} />
            Add work
          </button>
        }
      />
    );
  return (
    <div className={`task-list ${compact ? "compact" : ""}`}>
      {tasks.map((task) => {
        const contractor = workspace.contractors.find(
          (c) => c.id === task.contractorId,
        );
        const project = workspace.projects.find((p) => p.id === task.projectId);
        return (
          <div
            className={`task-row ${task.status === "Done" ? "task-done" : ""}`}
            key={task.id}
          >
            <button
              className={`task-check ${task.status === "Done" ? "checked" : ""}`}
              onClick={() => onToggle(task)}
              aria-label={`${task.status === "Done" ? "Reopen" : "Complete"} ${task.title}`}
            >
              {task.status === "Done" && <Check size={14} />}
            </button>
            <div className="task-main">
              <button
                className="text-button task-name"
                onClick={() => onEdit(task)}
              >
                {task.title}
              </button>
              <span className="task-work-kind">
                {workType(task)}
                {workTime(task) ? ` · ${workTime(task)} ET` : ""}
              </span>
              {onProject && project && (
                <button
                  className="task-project"
                  onClick={() => onProject(project.id)}
                >
                  {project.name}
                </button>
              )}
            </div>
            <span
              className={`priority priority-${task.priority.toLowerCase()}`}
            >
              <i />
              {task.priority}
            </span>
            <span
              className={`task-due ${overdue(task.dueDate, task.status) ? "is-overdue" : ""}`}
            >
              <CalendarDays size={13} />
              {task.dueDate
                ? dateLabel(task.dueDate).replace(/, \d{4}$/, "")
                : "No date"}
              {overdue(task.dueDate, task.status) && (
                <span className="overdue-label">Overdue</span>
              )}
            </span>
            {!compact && <Badge status={task.status} />}
            <span
              className="task-assignee"
              title={contractor?.name || "Unassigned"}
            >
              {contractor ? (
                <Avatar name={contractor.name} small />
              ) : (
                <span className="unassigned-avatar">—</span>
              )}
            </span>
            <div className="row-actions">
              <button
                className="icon-button"
                aria-label={`Edit ${task.title}`}
                onClick={() => onEdit(task)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="icon-button delete-action"
                aria-label={`Delete ${task.title}`}
                onClick={() => onDelete(task)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
