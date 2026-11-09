import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Mail, Phone } from "lucide-react";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import { readClientProjectPortal } from "@/lib/client-project-portal";
import type { ClientScheduleItem } from "@/lib/client-project-schedule";
import { isExpiredClientPortalToken } from "@/lib/client-portal";
import styles from "./project-portal.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your project schedule",
  description: "A private customer project schedule.",
  robots: { index: false, follow: false, noarchive: true },
};

function calendarDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function datePart(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(calendarDate(value));
}

function taskTime(item: ClientScheduleItem, locale: string) {
  const format = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: minute ? "2-digit" : undefined,
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
  };
  if (!item.startTime) return "";
  return item.endTime
    ? `${format(item.startTime)}–${format(item.endTime)}`
    : format(item.startTime);
}

export default async function ClientProjectPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const source = await readClientProjectPortal(token);
  if (!source) {
    if (isExpiredClientPortalToken(token))
      redirect("/client/sign-in?expired=1");
    notFound();
  }
  const business = await getBusinessConfigForOrganization(
    source.organizationId,
  );
  const locale = business.regional.locale;
  const grouped = source.schedule.reduce<
    Array<{ dueDate: string; items: ClientScheduleItem[] }>
  >((days, item) => {
    const current = days.at(-1);
    if (current?.dueDate === item.dueDate) current.items.push(item);
    else days.push({ dueDate: item.dueDate, items: [item] });
    return days;
  }, []);
  const nextItem = source.schedule.find((item) => item.status !== "Done");
  const completed = source.schedule.filter(
    (item) => item.status === "Done",
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.siteHeader}>
        <div className={styles.brand}>
          <strong>{business.profile.name}</strong>
          <span>Customer portal</span>
        </div>
        <div className={styles.contactLinks}>
          {business.profile.phone && (
            <a href={`tel:${business.profile.phone.replace(/[^\d+]/g, "")}`}>
              <Phone size={16} aria-hidden="true" />
              <span>{business.profile.phone}</span>
            </a>
          )}
          {business.profile.email && (
            <a href={`mailto:${business.profile.email}`}>
              <Mail size={16} aria-hidden="true" />
              <span>Email us</span>
            </a>
          )}
        </div>
      </header>

      <main>
        <section className={styles.projectIntro}>
          <div>
            <span>Project schedule</span>
            <h1>{source.project.name}</h1>
            <p>
              {source.project.address || "Project address on file"}
              {source.project.client ? ` · ${source.project.client}` : ""}
            </p>
          </div>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{source.project.status}</dd>
            </div>
            <div>
              <dt>Scheduled</dt>
              <dd>{source.schedule.length}</dd>
            </div>
            <div>
              <dt>Complete</dt>
              <dd>{completed}</dd>
            </div>
          </dl>
        </section>

        {source.schedule.length ? (
          <>
            <section
              className={styles.calendar}
              aria-label="Project calendar dates"
            >
              <div className={styles.calendarHeader}>
                <span>Calendar</span>
                <strong>
                  {datePart(grouped[0].dueDate, locale, {
                    month: "long",
                    year: "numeric",
                  })}
                  {grouped.at(-1)?.dueDate !== grouped[0].dueDate
                    ? ` – ${datePart(grouped.at(-1)!.dueDate, locale, {
                        month: "long",
                        year: "numeric",
                      })}`
                    : ""}
                </strong>
              </div>
              <div className={styles.dateRail}>
                {grouped.map((day) => (
                  <a key={day.dueDate} href={`#schedule-${day.dueDate}`}>
                    <span>
                      {datePart(day.dueDate, locale, { weekday: "short" })}
                    </span>
                    <strong>
                      {datePart(day.dueDate, locale, { day: "numeric" })}
                    </strong>
                    <small>
                      {day.items.length}{" "}
                      {day.items.length === 1 ? "item" : "items"}
                    </small>
                  </a>
                ))}
              </div>
            </section>

            {nextItem && (
              <p className={styles.nextItem}>
                <Clock3 size={18} aria-hidden="true" />
                <span>
                  <strong>Next up:</strong> {nextItem.title} ·{" "}
                  {datePart(nextItem.dueDate, locale, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                  {taskTime(nextItem, locale)
                    ? ` at ${taskTime(nextItem, locale)}`
                    : ""}
                </span>
              </p>
            )}

            <ol className={styles.timeline}>
              {grouped.map((day) => (
                <li key={day.dueDate} id={`schedule-${day.dueDate}`}>
                  <div className={styles.dateBadge} aria-hidden="true">
                    <span>
                      {datePart(day.dueDate, locale, { weekday: "short" })}
                    </span>
                    <strong>
                      {datePart(day.dueDate, locale, { day: "numeric" })}
                    </strong>
                    <small>
                      {datePart(day.dueDate, locale, { month: "short" })}
                    </small>
                  </div>
                  <div className={styles.dayItems}>
                    {day.items.map((item) => (
                      <article key={item.id}>
                        <div className={styles.itemHeading}>
                          <div>
                            <span>{item.workType}</span>
                            <h2>{item.title}</h2>
                          </div>
                          <span
                            className={`${styles.status} ${
                              item.status === "Done"
                                ? styles.done
                                : item.status === "In progress"
                                  ? styles.active
                                  : ""
                            }`}
                          >
                            {item.status === "Done" && (
                              <CheckCircle2 size={14} aria-hidden="true" />
                            )}
                            {item.status === "To do"
                              ? "Scheduled"
                              : item.status}
                          </span>
                        </div>
                        {taskTime(item, locale) && (
                          <p className={styles.itemTime}>
                            <Clock3 size={15} aria-hidden="true" />
                            {taskTime(item, locale)}
                          </p>
                        )}
                        {item.description && <p>{item.description}</p>}
                      </article>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <section className={styles.emptySchedule}>
            <CalendarDays size={34} aria-hidden="true" />
            <h2>No project dates are scheduled yet</h2>
            <p>Your timeline will appear here as dates are confirmed.</p>
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <span>{business.profile.name}</span>
        <span>Private customer portal</span>
      </footer>
    </div>
  );
}
