"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import type { GoogleCalendarStatus } from "@/lib/google-calendar-types";

const emptyStatus: GoogleCalendarStatus = {
  configured: false,
  connected: false,
  email: null,
  calendarName: null,
  lastSyncedAt: null,
  lastError: null,
};

function timeLabel(value: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function GoogleCalendarSettings({ demo }: { demo: boolean }) {
  const [status, setStatus] = useState<GoogleCalendarStatus>(emptyStatus);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState<"sync" | "disconnect" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) return;
      setError("");
      try {
        const response = await fetch("/api/google-calendar", {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not check Google Calendar.");
        if (!signal?.aborted) setStatus(data);
      } catch (caught) {
        if (!signal?.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not check Google Calendar.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    if (demo) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    const resultNotice = result
      ? result === "connected"
        ? "Google Calendar connected and the first sync has started."
        : result === "denied"
          ? "Google Calendar access was not approved."
          : result === "expired"
            ? "The Google connection request expired. Please try again."
            : "Google Calendar could not be connected. Please try again."
      : "";
    if (result) {
      params.delete("calendar");
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      );
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (resultNotice) {
        setNotice(resultNotice);
        setNoticeError(result !== "connected");
      }
      void refresh(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [demo, refresh]);

  async function run(action: "sync" | "disconnect") {
    setBusy(action);
    setError("");
    setNotice("");
    setNoticeError(false);
    try {
      const response = await fetch("/api/google-calendar", {
        method: action === "sync" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Google Calendar could not be updated.");
      setStatus(data);
      setNotice(
        action === "sync"
          ? `${data.count ?? 0} scheduled items synced to Google Calendar.`
          : "Google Calendar disconnected. The dedicated calendar remains in your Google account.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Google Calendar could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      className="settings-section"
      aria-labelledby="google-calendar-heading"
    >
      <div className="settings-title">
        <CalendarDays size={22} aria-hidden="true" />
        <div>
          <h2 id="google-calendar-heading">Google Calendar</h2>
          <p>
            Keep the built-in schedule and add a private Premium Remodel
            calendar to your Google account.
          </p>
        </div>
      </div>
      <div
        className="settings-form google-calendar-settings"
        aria-busy={loading || Boolean(busy)}
      >
        {demo ? (
          <p className="generation-note">
            Google Calendar connections are available in your signed-in company
            workspace.
          </p>
        ) : (
          <>
            {loading && (
              <p className="generation-note" role="status">
                Checking Google Calendar…
              </p>
            )}
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {notice && !error && (
              <div
                className={noticeError ? "alert" : "success-note"}
                role="status"
              >
                {notice}
              </div>
            )}
            {!loading && !status.configured && (
              <p className="generation-note">
                Google Calendar setup is not configured yet. Add the Google
                OAuth credentials to the secure server settings to enable
                account connections.
              </p>
            )}
            {status.configured && !status.connected && (
              <div className="calendar-connect-card">
                <div>
                  <strong>Connect your Google account</strong>
                  <p>
                    Premium Remodel creates and manages only its own secondary
                    calendar. It cannot read or change your other calendars.
                  </p>
                </div>
                <a
                  className="button primary"
                  href="/api/google-calendar/connect"
                >
                  <CalendarDays size={15} aria-hidden="true" />
                  Connect Google Calendar
                </a>
              </div>
            )}
            {status.connected && (
              <>
                <div className="success-note" role="status">
                  Connected · {status.email}
                </div>
                <dl className="google-calendar-details">
                  <div>
                    <dt>Google account</dt>
                    <dd>{status.email}</dd>
                  </div>
                  <div>
                    <dt>Calendar</dt>
                    <dd>{status.calendarName || "Premium Remodel"}</dd>
                  </div>
                  <div>
                    <dt>Last synced</dt>
                    <dd>{timeLabel(status.lastSyncedAt)}</dd>
                  </div>
                  <div>
                    <dt>Security</dt>
                    <dd>
                      <ShieldCheck size={14} aria-hidden="true" /> Encrypted
                      server connection
                    </dd>
                  </div>
                </dl>
                {status.lastError && (
                  <div className="alert" role="alert">
                    {status.lastError}
                  </div>
                )}
                <div className="google-calendar-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void run("sync")}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    {busy === "sync" ? "Syncing…" : "Sync now"}
                  </button>
                  <a
                    className="button secondary"
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Calendar
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    className="button danger"
                    disabled={Boolean(busy)}
                    onClick={() => void run("disconnect")}
                  >
                    <Unplug size={14} aria-hidden="true" />
                    {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
        <p className="generation-note calendar-sync-note">
          Project dates, tasks, inspections, deliveries, contractor visits, and
          consultations sync automatically. Edit scheduling in Premium Remodel;
          Google Calendar is a read-only copy of the workspace plan.
        </p>
      </div>
    </section>
  );
}
