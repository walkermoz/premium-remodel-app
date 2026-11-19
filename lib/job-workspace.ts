import type { Project, Quote, Task, Workspace } from "./types";

export type JobSection =
  | "Job"
  | "History"
  | "Forms"
  | "Estimates"
  | "Invoice"
  | "Schedule"
  | "Notes"
  | "Photos & files"
  | "Closeout";
export type JobRecord =
  { kind: "project"; record: Project } | { kind: "quote"; record: Quote };

export function jobRecords(workspace: Workspace): JobRecord[] {
  return [
    ...workspace.projects
      .filter((record) => record.recordType !== "project")
      .map((record): JobRecord => ({
        kind: "project",
        record,
      })),
  ].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
}

export function nextJobTask(tasks: Task[], today: string) {
  const open = tasks
    .filter((task) => task.status !== "Done" && task.dueDate)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        (a.startTime || "").localeCompare(b.startTime || ""),
    );
  return open.find((task) => task.dueDate >= today) || open[0];
}
export function nextJobVisit(project: Project, tasks: Task[], today: string) {
  const appointments: Task[] = (project.job?.appointments || [])
    .filter((appointment) => appointment.status !== "Canceled")
    .map((appointment) => ({
      id: appointment.id,
      projectId: project.id,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      title: appointment.title,
      description: "",
      contractorId: "",
      dueDate: appointment.date,
      startTime: appointment.start,
      endTime: appointment.end,
      workType: "Contractor visit",
      priority: "Medium",
      status: appointment.status === "Done" ? "Done" : "To do",
    }));
  return nextJobTask(appointments, today) || nextJobTask(tasks, today);
}

const normalized = (value?: string) => value?.trim().toLowerCase() || "";
export function sameJobCustomer(a: Project | Quote, b: Project | Quote) {
  if (a.id === b.id) return true;
  if (a.contactId && b.contactId) return a.contactId === b.contactId;
  const email = normalized(a.clientEmail);
  if (email && normalized(b.clientEmail))
    return email === normalized(b.clientEmail);
  const address = normalized(a.address);
  return Boolean(address && address === normalized(b.address));
}
