"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Copy, Plus, Trash2 } from "lucide-react";
import type {
  BookingFormDefinition,
  BookingFormInput,
} from "@/lib/booking-types";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function initialForm(): BookingFormInput {
  return {
    revision: 0,
    name: "Book a consultation",
    intro: "Choose your project type and a time for an on-site consultation.",
    enabled: false,
    mode: "request",
    services: [
      {
        id: crypto.randomUUID(),
        name: "Project consultation",
        durationMinutes: 60,
      },
    ],
    weekdays: [1, 2, 3, 4, 5],
    dayStart: "09:00",
    dayEnd: "17:00",
    slotIntervalMinutes: 30,
    leadTimeHours: 24,
    bookingWindowDays: 30,
    serviceAreaZips: [],
  };
}

export default function BookingFormSettings({ demo }: { demo: boolean }) {
  const [form, setForm] = useState<BookingFormInput | null>(null);
  const [publicToken, setPublicToken] = useState("");
  const [zipText, setZipText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const publicUrl = useMemo(
    () =>
      publicToken && typeof window !== "undefined"
        ? `${window.location.origin}/book/${publicToken}`
        : "",
    [publicToken],
  );
  const load = useCallback(async () => {
    if (demo) {
      setForm(initialForm());
      return;
    }
    try {
      const response = await fetch("/api/booking-form", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load booking settings.");
      const saved = data.form as BookingFormDefinition | null;
      setForm(saved || initialForm());
      setPublicToken(saved?.publicToken || "");
      setZipText(saved?.serviceAreaZips.join(", ") || "");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load booking settings.",
      );
    }
  }, [demo]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!form) return null;
  return (
    <section
      className="settings-section"
      aria-labelledby="booking-form-heading"
    >
      <div className="settings-title">
        <CalendarPlus size={22} />
        <div>
          <h2 id="booking-form-heading">Online booking</h2>
          <p>
            Publish a reusable, branded intake page that creates a lead and
            schedules the consultation.
          </p>
        </div>
      </div>
      <form
        className="settings-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (demo || busy) return;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const serviceAreaZips = [
              ...new Set(
                zipText
                  .split(/[\s,]+/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              ),
            ];
            const response = await fetch("/api/booking-form", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...form, serviceAreaZips }),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error || "Could not save booking settings.");
            setForm(data.form);
            setPublicToken(data.form.publicToken);
            setZipText(data.form.serviceAreaZips.join(", "));
            setMessage(
              data.form.enabled
                ? "Booking page published."
                : "Booking page saved as a draft.",
            );
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not save booking settings.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {demo && (
          <p className="generation-note">
            Online booking settings are available in your company workspace.
          </p>
        )}
        {publicUrl && (
          <div className="success-note">
            <strong>Public booking link</strong>
            <div className="form-grid">
              <input value={publicUrl} readOnly />
              <button
                type="button"
                className="button secondary"
                onClick={() => void navigator.clipboard.writeText(publicUrl)}
              >
                <Copy size={15} /> Copy
              </button>
            </div>
          </div>
        )}
        <div className="form-grid">
          <label>
            Page title
            <input
              value={form.name}
              maxLength={100}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
            />
          </label>
          <label>
            Booking behavior
            <select
              value={form.mode}
              onChange={(event) =>
                setForm({
                  ...form,
                  mode: event.target.value as "request" | "reserve",
                })
              }
            >
              <option value="request">Request — team confirms</option>
              <option value="reserve">Reserve — time is confirmed</option>
            </select>
          </label>
        </div>
        <label>
          Introduction
          <textarea
            value={form.intro}
            maxLength={600}
            rows={3}
            onChange={(event) =>
              setForm({ ...form, intro: event.target.value })
            }
          />
        </label>
        <fieldset>
          <legend>Services</legend>
          {form.services.map((service, index) => (
            <div className="form-grid" key={service.id}>
              <label>
                Service name
                <input
                  value={service.name}
                  maxLength={100}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      services: form.services.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Duration
                <select
                  value={service.durationMinutes}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      services: form.services.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              durationMinutes: Number(event.target.value),
                            }
                          : item,
                      ),
                    })
                  }
                >
                  {[30, 45, 60, 90, 120, 180, 240].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </label>
              {form.services.length > 1 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      services: form.services.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setForm({
                ...form,
                services: [
                  ...form.services,
                  { id: crypto.randomUUID(), name: "", durationMinutes: 60 },
                ],
              })
            }
          >
            <Plus size={15} /> Add service
          </button>
        </fieldset>
        <fieldset>
          <legend>Availability</legend>
          <div className="form-grid">
            <label>
              Starts
              <input
                type="time"
                value={form.dayStart}
                onChange={(event) =>
                  setForm({ ...form, dayStart: event.target.value })
                }
              />
            </label>
            <label>
              Ends
              <input
                type="time"
                value={form.dayEnd}
                onChange={(event) =>
                  setForm({ ...form, dayEnd: event.target.value })
                }
              />
            </label>
            <label>
              Slot spacing
              <select
                value={form.slotIntervalMinutes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    slotIntervalMinutes: Number(event.target.value) as
                      15 | 30 | 60,
                  })
                }
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>
            <label>
              Booking window (days)
              <input
                type="number"
                min={1}
                max={120}
                value={form.bookingWindowDays}
                onChange={(event) =>
                  setForm({
                    ...form,
                    bookingWindowDays: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Minimum notice (hours)
              <input
                type="number"
                min={0}
                max={336}
                value={form.leadTimeHours}
                onChange={(event) =>
                  setForm({
                    ...form,
                    leadTimeHours: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <div className="permissions-grid">
            {weekdayLabels.map((label, day) => (
              <label key={label}>
                <input
                  type="checkbox"
                  checked={form.weekdays.includes(day)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      weekdays: event.target.checked
                        ? [...form.weekdays, day].sort()
                        : form.weekdays.filter((item) => item !== day),
                    })
                  }
                />{" "}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Service-area ZIP codes{" "}
          <span className="label-hint">Optional, separated by commas</span>
          <textarea
            rows={2}
            value={zipText}
            onChange={(event) => setZipText(event.target.value)}
            placeholder="27601, 27603, 27604"
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm({ ...form, enabled: event.target.checked })
            }
          />{" "}
          Publish this booking page
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="success-note" role="status">
            {message}
          </div>
        )}
        <button className="button primary" disabled={demo || busy}>
          {busy ? "Saving…" : "Save online booking"}
        </button>
      </form>
    </section>
  );
}
