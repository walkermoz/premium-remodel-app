import type { Task } from "./types";
import type { CalendarEntry } from "./calendar";
import { calendarDate, calendarKey } from "./calendar";

export type UpcomingView = "List" | "Calendar";
export const workTimeZone = "America/New_York";
export function workToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: workTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function workType(task: Task) {
  return task.workType || "Task";
}
export function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
export function workTime(task: Task) {
  return task.startTime
    ? `${timeLabel(task.startTime)}${task.endTime ? `–${timeLabel(task.endTime)}` : ""}`
    : "";
}
export function entryTiming(entry: CalendarEntry) {
  if (entry.lead) {
    const start = entry.lead.quoteStartTime || "";
    const end = entry.lead.quoteEndTime || "";
    return start
      ? `${timeLabel(start)}${end ? `–${timeLabel(end)}` : ""}`
      : "Time TBD";
  }
  if (!entry.task)
    return entry.kind === "start" ? "Project start" : "Target completion";
  return (
    workTime(entry.task) ||
    (entry.date
      ? workType(entry.task) === "Task"
        ? "Due"
        : "Time TBD"
      : "Unscheduled")
  );
}
export function entryType(entry: CalendarEntry) {
  return entry.lead
    ? "Consultation"
    : entry.task
      ? workType(entry.task)
      : "Milestone";
}
export function groupUpcoming(entries: CalendarEntry[], today: string) {
  const end = calendarDate(today);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7)); // This week ends Sunday.
  const endOfWeek = calendarKey(end);
  const groups = [
    "Overdue",
    "Today",
    "This week",
    "Later",
    "Unscheduled",
    "Completed",
  ];
  const grouped = new Map(groups.map((name) => [name, [] as CalendarEntry[]]));
  for (const entry of entries) {
    // A past project start is history, not unfinished work.
    if (entry.kind === "start" && entry.date < today && !entry.completed)
      continue;
    const group = entry.completed
      ? "Completed"
      : !entry.date
        ? "Unscheduled"
        : entry.date < today
          ? "Overdue"
          : entry.date === today
            ? "Today"
            : entry.date <= endOfWeek
              ? "This week"
              : "Later";
    grouped.get(group)!.push(entry);
  }
  return [...grouped].filter(([, items]) => items.length);
}

// An older open browser may submit the original task fields only.
export function preserveWorkSchedule(
  data: Record<string, unknown>,
  current?: Task,
) {
  const result = { ...data };
  for (const key of ["workType", "startTime", "endTime"] as const)
    if (!(key in result) && current?.[key] !== undefined)
      result[key] = current[key];
  return result;
}
