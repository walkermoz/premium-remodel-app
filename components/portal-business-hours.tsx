import type { OperatingSettings } from "@/lib/operating-settings";
import styles from "./portal-business-hours.module.css";

export default function PortalBusinessHours({
  hours,
  timezone,
  locale,
}: {
  hours: OperatingSettings["hours"];
  timezone: string;
  locale: string;
}) {
  if (!hours.enabled) return null;
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`2000-01-02T${value}:00Z`));
  const zone =
    new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value || timezone;
  return (
    <section className={styles.hours} aria-label="Business hours">
      <h2>Business hours</h2>
      <p>All times {zone}.</p>
      <dl>
        {[...hours.days]
          .sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7))
          .map((day) => (
            <div key={day.day}>
              <dt>
                {new Intl.DateTimeFormat(locale, {
                  weekday: "long",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2026, 10, 22 + day.day)))}
              </dt>
              <dd>
                {day.open ? `${time(day.start)} – ${time(day.end)}` : "Closed"}
              </dd>
            </div>
          ))}
      </dl>
      {!!hours.exceptions.length && (
        <>
          <h3>Holiday hours and exceptions</h3>
          <dl>
            {[...hours.exceptions]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((day) => (
                <div key={day.date}>
                  <dt>
                    {new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${day.date}T12:00:00Z`))}
                  </dt>
                  <dd>
                    {day.closed
                      ? "Closed"
                      : `${time(day.start)} – ${time(day.end)}`}
                    {day.note && <small>{day.note}</small>}
                  </dd>
                </div>
              ))}
          </dl>
        </>
      )}
    </section>
  );
}
