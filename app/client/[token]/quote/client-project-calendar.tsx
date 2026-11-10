"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { calendarDays, shiftMonth } from "@/lib/calendar";
import type { ClientScheduleItem } from "@/lib/client-quote";
import { workToday } from "@/lib/work";
import styles from "./quote.module.css";

type PortalScheduleItem = ClientScheduleItem & { projectName?: string };

function calendarDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateLabel(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(calendarDate(value));
}

function timeLabel(item: ClientScheduleItem, locale: string) {
  const format = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: minute ? "2-digit" : undefined,
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
  };
  if (!item.startTime) return "Time TBD";
  return item.endTime
    ? `${format(item.startTime)}–${format(item.endTime)}`
    : format(item.startTime);
}

function shiftDay(value: string, amount: number) {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string) {
  return shiftDay(value, -calendarDate(value).getUTCDay());
}

export default function ClientProjectCalendar({
  schedule,
  locale,
  timeZone,
  projectName,
}: {
  schedule: PortalScheduleItem[];
  locale: string;
  timeZone: string;
  projectName: string;
}) {
  const today = workToday(new Date(), timeZone);
  const initialDay =
    schedule.find((item) => item.dueDate >= today && item.status !== "Done")
      ?.dueDate ||
    schedule.at(0)?.dueDate ||
    today;
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [month, setMonth] = useState(initialDay.slice(0, 7));
  const [mobileMonthOpen, setMobileMonthOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const byDate = useMemo(() => {
    const grouped = new Map<string, PortalScheduleItem[]>();
    for (const item of schedule)
      grouped.set(item.dueDate, [...(grouped.get(item.dueDate) || []), item]);
    return grouped;
  }, [schedule]);
  const days = calendarDays(month);
  const selected = byDate.get(selectedDay) || [];
  const upcoming = useMemo(
    () =>
      schedule.filter(
        (item) => item.dueDate >= today && item.status !== "Done",
      ),
    [schedule, today],
  );
  const upcomingGroups = useMemo(() => {
    const grouped = new Map<string, PortalScheduleItem[]>();
    for (const item of upcoming)
      grouped.set(item.dueDate, [...(grouped.get(item.dueDate) || []), item]);
    return [...grouped.entries()];
  }, [upcoming]);
  const weekStart = startOfWeek(selectedDay);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    shiftDay(weekStart, index),
  );
  const nextItem = upcoming[0];

  function selectDay(day: string) {
    setSelectedDay(day);
    setMonth(day.slice(0, 7));
  }

  function changeMonth(next: string) {
    setMonth(next);
    const nextDay = next === today.slice(0, 7) ? today : `${next}-01`;
    setSelectedDay(nextDay);
  }

  function changeWeek(offset: number) {
    selectDay(shiftDay(selectedDay, offset * 7));
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 45) return;
    event.preventDefault();
    changeWeek(distance < 0 ? 1 : -1);
  }

  if (!schedule.length)
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>
          <CalendarDays size={30} aria-hidden="true" />
        </span>
        <h2>No project dates are scheduled yet</h2>
        <p>Your project calendar will appear here as dates are confirmed.</p>
      </div>
    );

  return (
    <>
      <header className={styles.scheduleHeading}>
        <div>
          <span>{projectName} · Project schedule</span>
          <h1>Your calendar</h1>
          <p>
            Confirmed work, inspections, deliveries, and project milestones.
            This updates automatically when the project schedule changes.
          </p>
        </div>
        {nextItem && (
          <div className={styles.scheduleNextSummary}>
            <span>Next up</span>
            <strong>{nextItem.title}</strong>
            {nextItem.projectName && <em>{nextItem.projectName}</em>}
            <small>
              {dateLabel(nextItem.dueDate, locale, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
              {` · ${timeLabel(nextItem, locale)}`}
            </small>
          </div>
        )}
      </header>

      <div className={styles.customerCalendarLayout}>
        <section className={styles.customerCalendar}>
          <div className={styles.customerCalendarToolbar}>
            <div>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => changeMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => changeMonth(shiftMonth(month, 1))}
              >
                <ChevronRight size={17} />
              </button>
              <h2 aria-live="polite">
                {dateLabel(`${month}-01`, locale, {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>
            <button type="button" onClick={() => selectDay(today)}>
              Today
            </button>
          </div>
          <div className={styles.customerCalendarScroll}>
            <table
              className={styles.customerCalendarGrid}
              aria-label={`${dateLabel(`${month}-01`, locale, {
                month: "long",
                year: "numeric",
              })} project calendar`}
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
                    <th key={day} scope="col">
                      <abbr title={day}>{day.slice(0, 3)}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, week) => (
                  <tr key={week}>
                    {days.slice(week * 7, week * 7 + 7).map((day) => {
                      const items = byDate.get(day) || [];
                      return (
                        <td
                          key={day}
                          className={`${day.slice(0, 7) !== month ? styles.customerCalendarOutside : ""} ${day === selectedDay ? styles.customerCalendarSelected : ""}`}
                          onClick={() => selectDay(day)}
                        >
                          <button
                            type="button"
                            className={`${styles.customerCalendarDay} ${day === today ? styles.customerCalendarToday : ""}`}
                            aria-label={`Select ${dateLabel(day, locale, {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}${items.length ? `, ${items.length} scheduled` : ""}`}
                            aria-current={day === today ? "date" : undefined}
                            aria-pressed={day === selectedDay}
                            onClick={() => selectDay(day)}
                          >
                            {Number(day.slice(-2))}
                          </button>
                          <div className={styles.customerCalendarEvents}>
                            {items.slice(0, 3).map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                className={`${styles.customerCalendarEvent} ${item.status === "Done" ? styles.customerCalendarEventDone : ""}`}
                                title={`${timeLabel(item, locale)} · ${item.title}${item.projectName ? ` · ${item.projectName}` : ""}`}
                                onClick={() => selectDay(day)}
                              >
                                <small>{timeLabel(item, locale)}</small>
                                <span>{item.title}</span>
                              </button>
                            ))}
                            {items.length > 3 && (
                              <button
                                type="button"
                                className={styles.customerCalendarMore}
                                onClick={() => selectDay(day)}
                              >
                                +{items.length - 3} more
                              </button>
                            )}
                          </div>
                          {!!items.length && (
                            <span
                              className={styles.customerCalendarMobileCount}
                              aria-hidden="true"
                            >
                              <i /> {items.length}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className={styles.customerCalendarAgenda}>
          <section aria-label="Selected day schedule">
            <header>
              <span>Selected day</span>
              <h2>
                {dateLabel(selectedDay, locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <p>
                {selected.length} scheduled{" "}
                {selected.length === 1 ? "item" : "items"}
              </p>
            </header>
            {selected.length ? (
              <ul>
                {selected.map((item) => (
                  <li key={item.id}>
                    <span className={styles.customerCalendarMark}>
                      {item.status === "Done" ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <CalendarDays size={14} />
                      )}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      {item.projectName && (
                        <em className={styles.calendarProjectName}>
                          {item.projectName}
                        </em>
                      )}
                      <span>{timeLabel(item, locale)}</span>
                      {item.description && <p>{item.description}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.customerCalendarEmpty}>
                Nothing is scheduled for this day.
              </p>
            )}
          </section>
          <section
            className={styles.customerCalendarUpcoming}
            aria-label="Upcoming project schedule"
          >
            <h3>Coming up</h3>
            {upcoming.length ? (
              <ul>
                {upcoming.map((item) => (
                  <li key={`upcoming-${item.id}`}>
                    <time dateTime={item.dueDate}>
                      {dateLabel(item.dueDate, locale, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <span>
                      {item.title}
                      {item.projectName && <small>{item.projectName}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.customerCalendarEmpty}>
                No upcoming dates are scheduled.
              </p>
            )}
          </section>
        </aside>
      </div>

      <section
        className={styles.mobileCalendar}
        aria-label="Mobile project calendar"
      >
        <div className={styles.mobileCalendarToolbar}>
          <div>
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => changeWeek(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div>
              <span>{mobileMonthOpen ? "Full schedule" : "This week"}</span>
              <strong aria-live="polite">
                {dateLabel(selectedDay, locale, {
                  month: "long",
                  year: "numeric",
                })}
              </strong>
            </div>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => changeWeek(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className={styles.mobileCalendarToday}
            onClick={() => selectDay(today)}
          >
            Today
          </button>
        </div>

        {!mobileMonthOpen && (
          <div
            className={styles.mobileWeekStrip}
            aria-label="Choose a day"
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0].clientX;
            }}
            onTouchEnd={handleTouchEnd}
          >
            {weekDays.map((day) => {
              const items = byDate.get(day) || [];
              return (
                <button
                  type="button"
                  key={day}
                  className={
                    day === selectedDay ? styles.mobileWeekSelected : ""
                  }
                  aria-label={`Select ${dateLabel(day, locale, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}${items.length ? `, ${items.length} scheduled` : ""}`}
                  aria-current={day === today ? "date" : undefined}
                  aria-pressed={day === selectedDay}
                  onClick={() => selectDay(day)}
                >
                  <span>
                    {dateLabel(day, locale, { weekday: "short" }).slice(0, 2)}
                  </span>
                  <strong>{Number(day.slice(-2))}</strong>
                  {!!items.length && (
                    <i
                      className={styles.mobileWeekHasItems}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className={styles.mobileMonthToggle}
          aria-expanded={mobileMonthOpen}
          onClick={() => setMobileMonthOpen((open) => !open)}
        >
          <CalendarDays size={15} aria-hidden="true" />
          {mobileMonthOpen ? "Back to agenda" : "View full month"}
        </button>

        {mobileMonthOpen ? (
          <div
            className={styles.mobileMonth}
            role="group"
            aria-label={`${dateLabel(`${month}-01`, locale, {
              month: "long",
              year: "numeric",
            })} mobile project calendar`}
          >
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
            {days.map((day) => {
              const items = byDate.get(day) || [];
              return (
                <button
                  type="button"
                  key={day}
                  className={`${day.slice(0, 7) !== month ? styles.mobileMonthOutside : ""} ${day === selectedDay ? styles.mobileMonthSelected : ""}`}
                  aria-label={`Select ${dateLabel(day, locale, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}${items.length ? `, ${items.length} scheduled` : ""}`}
                  aria-current={day === today ? "date" : undefined}
                  aria-pressed={day === selectedDay}
                  onClick={() => {
                    selectDay(day);
                    setMobileMonthOpen(false);
                  }}
                >
                  <strong>{Number(day.slice(-2))}</strong>
                  {!!items.length && <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <section
              className={styles.mobileDayAgenda}
              aria-label="Selected day schedule"
            >
              <header>
                <div>
                  <span>Selected day</span>
                  <h2>
                    {dateLabel(selectedDay, locale, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </h2>
                </div>
                <strong>
                  {selected.length} {selected.length === 1 ? "item" : "items"}
                </strong>
              </header>
              {selected.length ? (
                <ul>
                  {selected.map((item) => (
                    <li key={`mobile-${item.id}`}>
                      <span className={styles.customerCalendarMark}>
                        {item.status === "Done" ? (
                          <CheckCircle2 size={15} aria-hidden="true" />
                        ) : (
                          <CalendarDays size={15} aria-hidden="true" />
                        )}
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        {item.projectName && (
                          <em className={styles.calendarProjectName}>
                            {item.projectName}
                          </em>
                        )}
                        <span>{timeLabel(item, locale)}</span>
                        {item.description && <p>{item.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.mobileDayEmpty}>
                  Nothing is scheduled for this day.
                </p>
              )}
            </section>

            <section
              className={styles.mobileUpcoming}
              aria-label="Mobile upcoming project schedule"
            >
              <header>
                <span>Coming up</span>
                <h2>Your project schedule</h2>
              </header>
              {upcomingGroups.length ? (
                <div>
                  {upcomingGroups.map(([day, items]) => (
                    <section key={day}>
                      <button type="button" onClick={() => selectDay(day)}>
                        <span>
                          {dateLabel(day, locale, { weekday: "short" })}
                        </span>
                        <strong>{Number(day.slice(-2))}</strong>
                        <small>
                          {dateLabel(day, locale, { month: "short" })}
                        </small>
                      </button>
                      <ul>
                        {items.map((item) => (
                          <li key={`mobile-upcoming-${item.id}`}>
                            <button
                              type="button"
                              onClick={() => selectDay(day)}
                            >
                              <span>{timeLabel(item, locale)}</span>
                              <strong>{item.title}</strong>
                              {item.projectName && (
                                <small>{item.projectName}</small>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <p className={styles.mobileDayEmpty}>
                  No upcoming dates are scheduled.
                </p>
              )}
            </section>
          </>
        )}
      </section>
      <p className={styles.customerCalendarNote}>
        <Clock3 size={14} aria-hidden="true" /> Times and dates may change as
        work progresses. This calendar always shows the latest schedule.
      </p>
    </>
  );
}
