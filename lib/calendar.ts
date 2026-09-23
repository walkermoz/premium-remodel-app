import type { Contact, Lead, Project, Task, Workspace } from "./types";

export type CalendarKind = "task" | "start" | "finish" | "appointment";
export interface CalendarEntry {
  id: string;
  date: string;
  title: string;
  kind: CalendarKind;
  project?: Project;
  task?: Task;
  lead?: Lead;
  contact?: Contact;
  completed: boolean;
}

// Treat stored dates as calendar days, never UTC instants. Noon avoids DST gaps.
export function calendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
export function calendarKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validCalendarDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    calendarKey(calendarDate(value)) === value
  );
}
export function shiftMonth(month: string, offset: number) {
  const first = calendarDate(`${month}-01`);
  first.setMonth(first.getMonth() + offset);
  return calendarKey(first).slice(0, 7);
}
export function calendarDays(month: string) {
  const start = calendarDate(`${month}-01`);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return calendarKey(date);
  });
}
export function calendarEntries(
  workspace: Workspace,
  projectId = "",
  showCompleted = false,
  includeUnscheduled = false,
): CalendarEntry[] {
  const projects = new Map(
    workspace.projects
      .filter((p) => !projectId || p.id === projectId)
      .map((p) => [p.id, p]),
  );
  const entries: CalendarEntry[] = [];
  for (const project of projects.values()) {
    const completed = project.status === "Completed";
    if (completed && !showCompleted) continue;
    for (const [kind, date, title] of [
      ["start", project.startDate, "Project starts"],
      ["finish", project.endDate, "Target completion"],
    ] as const) {
      if (validCalendarDate(date))
        entries.push({
          id: `${kind}:${project.id}`,
          date,
          title,
          kind,
          project,
          completed,
        });
    }
  }
  for (const task of workspace.tasks) {
    const project = projects.get(task.projectId);
    const completed = task.status === "Done";
    if (
      !project ||
      (!validCalendarDate(task.dueDate) &&
        !(includeUnscheduled && !task.dueDate)) ||
      (completed && !showCompleted)
    )
      continue;
    entries.push({
      id: `task:${task.id}`,
      date: task.dueDate,
      title: task.title,
      kind: "task",
      project,
      task,
      completed,
    });
  }
  if (!projectId) {
    const contacts = new Map(workspace.contacts.map((item) => [item.id, item]));
    for (const lead of workspace.leads) {
      if (!lead.quoteDate || !validCalendarDate(lead.quoteDate)) continue;
      const contact = contacts.get(lead.contactId);
      entries.push({
        id: `appointment:${lead.id}`,
        date: lead.quoteDate,
        title: `Consultation · ${lead.name}`,
        kind: "appointment",
        lead,
        contact,
        completed: false,
      });
    }
  }
  return entries.sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      (a.task?.startTime || a.lead?.quoteStartTime || "99:99").localeCompare(
        b.task?.startTime || b.lead?.quoteStartTime || "99:99",
      ) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}
