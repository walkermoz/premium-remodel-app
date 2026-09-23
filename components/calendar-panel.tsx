"use client";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  CalendarClock,
} from "lucide-react";
import type { Project, Task, Workspace } from "@/lib/types";
import { entryTiming, entryType, workToday } from "@/lib/work";
import {
  calendarDate,
  calendarDays,
  validCalendarDate,
  shiftMonth,
  type CalendarEntry,
} from "@/lib/calendar";

const dateTitle = (value: string) =>
  calendarDate(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export default function CalendarPanel({
  workspace,
  projectId,
  onEditTask,
  onEditProject,
  onOpenProject,
  onOpenLead,
  entries: allEntries,
  selectedDay,
  onSelectDay,
  onToggleTask,
}: {
  workspace: Workspace;
  projectId?: string;
  onEditTask: (task: Task) => void;
  onEditProject: (project: Project) => void;
  onOpenProject?: (id: string) => void;
  onOpenLead?: (id: string) => void;
  entries: CalendarEntry[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onToggleTask: (task: Task) => void;
}) {
  const currentDay = workToday();
  const [month, setMonth] = useState(() => selectedDay.slice(0, 7));
  const [upcomingLimit, setUpcomingLimit] = useState(8);
  const entries = allEntries.filter((entry) => validCalendarDate(entry.date));
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries)
    byDate.set(entry.date, [...(byDate.get(entry.date) || []), entry]);
  const days = calendarDays(month);
  const selected = byDate.get(selectedDay) || [];
  const upcoming = entries.filter(
    (entry) => entry.date >= currentDay && !entry.completed,
  );
  const unscheduled = allEntries
    .filter((entry) => entry.task && !entry.date)
    .map((entry) => entry.task!);
  const monthTitle = calendarDate(`${month}-01`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function selectDay(day: string) {
    onSelectDay(day);
    setMonth(day.slice(0, 7));
  }
  function changeMonth(next: string) {
    setMonth(next);
    onSelectDay(next === currentDay.slice(0, 7) ? currentDay : `${next}-01`);
  }
  function openEntry(entry: CalendarEntry) {
    if (entry.lead) onOpenLead?.(entry.lead.id);
    else if (entry.task) onEditTask(entry.task);
    else if (entry.project) onEditProject(entry.project);
  }
  function agendaEntry(entry: CalendarEntry, withDate = false) {
    const contractor =
      entry.task &&
      workspace.contractors.find((c) => c.id === entry.task?.contractorId);
    const late =
      (entry.kind === "task" || entry.kind === "appointment") &&
      !entry.completed &&
      entry.date < currentDay;
    return (
      <li
        key={entry.id}
        className={`calendar-agenda-entry ${entry.completed ? "is-completed" : ""}`}
      >
        <span
          className={`calendar-entry-mark calendar-${entry.kind}`}
          aria-hidden="true"
        >
          {entry.kind === "appointment" ? (
            <CalendarClock size={15} />
          ) : entry.kind === "task" ? (
            <CalendarDays size={15} />
          ) : (
            <Flag size={15} />
          )}
        </span>
        <div className="calendar-entry-body">
          <button
            className="calendar-entry-title"
            onClick={() => openEntry(entry)}
          >
            {entry.title}
          </button>
          {!projectId && entry.project && onOpenProject ? (
            <button
              className="calendar-project-link"
              onClick={() => onOpenProject(entry.project!.id)}
            >
              {entry.project.name}
            </button>
          ) : entry.lead ? (
            <button
              className="calendar-project-link"
              onClick={() => onOpenLead?.(entry.lead!.id)}
            >
              Lead · {entry.lead.name}
            </button>
          ) : null}
          <span className="calendar-entry-meta">
            {withDate
              ? calendarDate(entry.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : entryType(entry)}
            {` · ${entryTiming(entry)}`}
            {entry.completed ? " · Completed" : late ? " · Overdue" : ""}
          </span>
          {contractor && (
            <span className="calendar-entry-meta">{contractor.name}</span>
          )}
          {entry.contact?.address && (
            <span className="calendar-entry-meta">{entry.contact.address}</span>
          )}
        </div>
        {entry.task && (
          <button
            className={`task-check ${entry.completed ? "checked" : ""}`}
            onClick={() => onToggleTask(entry.task!)}
            aria-label={`${entry.completed ? "Reopen" : "Complete"} ${entry.title}`}
          >
            {entry.completed && <Check size={13} />}
          </button>
        )}
      </li>
    );
  }

  return (
    <section
      className="calendar-panel"
      aria-label={projectId ? "Project calendar" : "Workspace calendar"}
    >
      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <div className="calendar-arrows">
            <button
              className="icon-button"
              aria-label="Previous month"
              onClick={() => changeMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next month"
              onClick={() => changeMonth(shiftMonth(month, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <h2 aria-live="polite">{monthTitle}</h2>
          <button
            className="button secondary small-button"
            onClick={() => selectDay(currentDay)}
          >
            Today
          </button>
        </div>
        <div className="calendar-toolbar-actions">
          <label className="calendar-jump">
            <span className="sr-only">Jump to month</span>
            <input
              type="month"
              value={month}
              min="1900-01"
              max="9999-12"
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value))
                  changeMonth(e.target.value);
              }}
            />
          </label>
        </div>
      </div>
      <div className="calendar-filters">
        <div className="calendar-legend" aria-label="Calendar legend">
          <span>
            <i className="calendar-task" />
            Work
          </span>
          <span>
            <i className="calendar-start" />
            Starts
          </span>
          <span>
            <i className="calendar-finish" />
            Completions
          </span>
          {!projectId && (
            <span>
              <i className="calendar-appointment" />
              Consultations
            </span>
          )}
        </div>
      </div>
      {!entries.length && (
        <p className="calendar-hint">
          {workspace.projects.length
            ? "No dated work matches your filters. Add a date to schedule an item."
            : "Create a project to start scheduling work."}
        </p>
      )}
      <div className="calendar-layout">
        <div className="calendar-grid-wrap">
          <table
            className="calendar-grid"
            aria-label={`${monthTitle} calendar`}
          >
            <thead>
              <tr>
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((day) => (
                  <th scope="col" key={day}>
                    <abbr title={day}>{day.slice(0, 3)}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((day) => {
                    const dayEntries = byDate.get(day) || [];
                    return (
                      <td
                        key={day}
                        data-date={day}
                        className={`${day.slice(0, 7) !== month ? "calendar-outside" : ""} ${day === selectedDay ? "calendar-selected" : ""}`}
                      >
                        <button
                          className={`calendar-day-number ${day === currentDay ? "calendar-today" : ""}`}
                          aria-label={`Select ${dateTitle(day)}${dayEntries.length ? `, ${dayEntries.length} scheduled` : ""}`}
                          aria-current={day === currentDay ? "date" : undefined}
                          aria-pressed={selectedDay === day}
                          onClick={() => selectDay(day)}
                        >
                          {Number(day.slice(-2))}
                        </button>
                        <div className="calendar-day-events">
                          {dayEntries.slice(0, 3).map((entry) => (
                            <button
                              key={entry.id}
                              className={`calendar-event calendar-${entry.kind} ${entry.completed ? "is-completed" : ""}`}
                              title={`${entryTiming(entry)} · ${entryType(entry)} · ${entry.title}${entry.project ? ` · ${entry.project.name}` : entry.contact ? ` · ${entry.contact.address}` : ""}`}
                              onClick={() => openEntry(entry)}
                            >
                              <small className="calendar-event-time">
                                {entryTiming(entry)}
                              </small>
                              <span>{entry.title}</span>
                              {!projectId && (
                                <small>
                                  {entry.project?.name ||
                                    entry.contact?.address}
                                </small>
                              )}
                            </button>
                          ))}
                          {dayEntries.length > 3 && (
                            <button
                              className="calendar-more"
                              onClick={() => selectDay(day)}
                            >
                              +{dayEntries.length - 3} more
                            </button>
                          )}
                        </div>
                        {!!dayEntries.length && (
                          <span
                            className="calendar-mobile-count"
                            aria-hidden="true"
                          >
                            <i />
                            {dayEntries.length}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="calendar-grid-note">
            Select a day to see its schedule. Select an item to edit its date or
            details.
          </p>
          {!!unscheduled.length && (
            <details className="calendar-unscheduled">
              <summary>
                {unscheduled.length}{" "}
                {unscheduled.length === 1
                  ? "work item without a date"
                  : "work items without dates"}
              </summary>
              <ul>
                {unscheduled.map((task) => (
                  <li key={task.id}>
                    <button
                      className="text-button link"
                      onClick={() => onEditTask(task)}
                    >
                      {task.title}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <aside className="calendar-agenda">
          <section
            className="calendar-selected-agenda"
            aria-label="Selected day schedule"
          >
            <div className="calendar-agenda-heading">
              <span className="eyebrow">SELECTED DAY</span>
              <h3>{dateTitle(selectedDay)}</h3>
              <p>
                {selected.length}{" "}
                {selected.length === 1 ? "scheduled item" : "scheduled items"}
              </p>
            </div>
            {selected.length ? (
              <ul>{selected.map((entry) => agendaEntry(entry))}</ul>
            ) : (
              <p className="calendar-empty-day">
                Nothing scheduled. Add work for this day or choose another date.
              </p>
            )}
          </section>
          <section className="calendar-upcoming" aria-label="Upcoming schedule">
            <div className="calendar-agenda-heading">
              <h3>Coming up</h3>
              <p>From today onward</p>
            </div>
            {upcoming.length ? (
              <>
                <ul>
                  {upcoming
                    .slice(0, upcomingLimit)
                    .map((entry) => agendaEntry(entry, true))}
                </ul>
                {upcoming.length > upcomingLimit && (
                  <button
                    className="text-button link calendar-show-more"
                    onClick={() => setUpcomingLimit((limit) => limit + 8)}
                  >
                    Show more upcoming work
                  </button>
                )}
              </>
            ) : (
              <p className="calendar-empty-day">
                No upcoming dates. Scheduled work will appear here.
              </p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
