"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import type { BookingService, BookingSlot } from "@/lib/booking-types";
import styles from "./booking.module.css";

type FormView = {
  mode: "request" | "reserve";
  services: BookingService[];
  weekdays: number[];
  bookingWindowDays: number;
  serviceAreaZips: string[];
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function BookingExperience({
  token,
  form,
  business,
}: {
  token: string;
  form: FormView;
  business: {
    name: string;
    phone: string;
    email: string;
    smsReady: boolean;
    privacyUrl: string;
    termsUrl: string;
  };
}) {
  const dates = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    for (let offset = 0; offset <= form.bookingWindowDays; offset++) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      if (!form.weekdays.includes(date.getDay())) continue;
      result.push({
        value: dateKey(date),
        label: new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(date),
      });
    }
    return result;
  }, [form.bookingWindowDays, form.weekdays]);
  const [serviceId, setServiceId] = useState(form.services[0]?.id || "");
  const [date, setDate] = useState(dates[0]?.value || "");
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [start, setStart] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<BookingSlot | null>(null);

  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingSlots(true);
      setStart("");
      fetch(
        `/api/public-booking/${token}?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not load times.");
          setSlots(data.slots || []);
        })
        .catch((reason) => {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load times.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingSlots(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [date, serviceId, token]);

  if (done)
    return (
      <div className={styles.confirmation} role="status">
        <CheckCircle2 size={42} />
        <h2>
          {form.mode === "reserve" ? "You’re booked." : "Request received."}
        </h2>
        <p>
          {date} at {timeLabel(done.start)}. {business.name} will send the next
          steps using the contact details you provided.
        </p>
      </div>
    );

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!start || busy) return;
        setBusy(true);
        setError("");
        try {
          const payload = Object.fromEntries(new FormData(event.currentTarget));
          const response = await fetch(`/api/public-booking/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              submissionId: crypto.randomUUID(),
              serviceId,
              date,
              start,
              smsAppointmentOptIn: payload.smsAppointmentOptIn === "on",
            }),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Could not submit booking.");
          setDone(data.booking);
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not submit booking.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <section>
        <div className={styles.sectionTitle}>
          <CalendarDays size={20} />
          <h2>Choose a service</h2>
        </div>
        <div className={styles.services}>
          {form.services.map((service) => (
            <button
              key={service.id}
              type="button"
              className={service.id === serviceId ? styles.selected : ""}
              onClick={() => setServiceId(service.id)}
            >
              <strong>{service.name}</strong>
              <span>{service.durationMinutes} minutes</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className={styles.sectionTitle}>
          <Clock3 size={20} />
          <h2>Choose a time</h2>
        </div>
        <label>
          Date
          <select
            value={date}
            onChange={(event) => setDate(event.target.value)}
          >
            {dates.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.slots} aria-busy={loadingSlots}>
          {loadingSlots ? (
            <p>Checking availability…</p>
          ) : slots.length ? (
            slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                className={slot.start === start ? styles.selected : ""}
                onClick={() => setStart(slot.start)}
              >
                {timeLabel(slot.start)}
              </button>
            ))
          ) : (
            <p>No times are open on this date.</p>
          )}
        </div>
      </section>
      <section>
        <div className={styles.sectionTitle}>
          <h2>Your details</h2>
        </div>
        <div className={styles.grid}>
          <label>
            First name
            <input name="firstName" required maxLength={100} />
          </label>
          <label>
            Last name
            <input name="lastName" maxLength={100} />
          </label>
          <label>
            Email
            <input name="email" type="email" maxLength={250} />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" maxLength={30} />
          </label>
          <label className={styles.wide}>
            Street address
            <input name="address" maxLength={250} />
          </label>
          <label>
            ZIP code
            <input name="zip" inputMode="numeric" pattern="[0-9]{5}" required />
          </label>
          <label className={styles.wide}>
            Tell us about the project
            <textarea name="details" rows={4} maxLength={5000} />
          </label>
        </div>
        {form.serviceAreaZips.length > 0 && (
          <p className={styles.note}>
            Available in {form.serviceAreaZips.length} configured ZIP{" "}
            {form.serviceAreaZips.length === 1 ? "code" : "codes"}.
          </p>
        )}
        {business.smsReady && (
          <label className={styles.consent}>
            <input type="checkbox" name="smsAppointmentOptIn" /> Send
            appointment and project updates by text. Message and data rates may
            apply. Reply STOP to opt out. <a href={business.termsUrl}>Terms</a>{" "}
            · <a href={business.privacyUrl}>Privacy</a>
          </label>
        )}
      </section>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <button className={styles.submit} disabled={!start || busy}>
        {busy
          ? "Submitting…"
          : form.mode === "reserve"
            ? "Reserve appointment"
            : "Request appointment"}
      </button>
      <p className={styles.contact}>
        Questions? {business.phone || business.email}
      </p>
    </form>
  );
}
