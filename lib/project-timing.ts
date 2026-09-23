import type { Project } from "./types";
import { dateLabel } from "./utils";
import { workToday } from "./work";

// Keep lifecycle dates consistent for both the API and the sample workspace.
export function projectDates(
  data: Record<string, unknown>,
  current?: Project | null,
  today = workToday(),
) {
  const result = { ...data };
  if (result.status === "In progress" && result.startDate === "")
    result.startDate = today;
  if (result.status === "Completed") {
    if (!("completedDate" in result))
      result.completedDate = current?.completedDate || "";
    if (!result.completedDate && current?.status !== "Completed")
      result.completedDate = today;
  } else result.completedDate = "";
  return result;
}

export function contractClock(project: Project, today = workToday()) {
  if (project.status === "Planning")
    return {
      days: null,
      label: "Not started",
      detail: "Set the project to In progress when work begins.",
    };
  if (!project.startDate)
    return {
      days: null,
      label: "Add a start date",
      detail: "Edit the project to start counting days on contract.",
    };
  if (project.status === "Completed" && !project.completedDate)
    return {
      days: null,
      label: "Add completion date",
      detail: "Edit the project to record its final days on contract.",
    };
  if (project.startDate > today)
    return {
      days: null,
      label: "Not started",
      detail: `Starts ${dateLabel(project.startDate)}.`,
    };
  const end = project.status === "Completed" ? project.completedDate! : today;
  const difference = Date.parse(end) - Date.parse(project.startDate);
  if (!Number.isFinite(difference) || difference < 0)
    return {
      days: null,
      label: "Check project dates",
      detail: "The completion date must be on or after the start date.",
    };
  // Date-only UTC values avoid daylight-saving changes; the start date is day 1.
  const days = Math.floor(difference / 86_400_000) + 1;
  return {
    days,
    label: `${days} ${days === 1 ? "day" : "days"} ${project.status === "Completed" ? "total" : "on contract"}`,
    detail:
      project.status === "Completed"
        ? `${dateLabel(project.startDate)} – ${dateLabel(end)} · Final duration`
        : `Started ${dateLabel(project.startDate)}`,
  };
}
