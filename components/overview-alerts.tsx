"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight } from "lucide-react";
import type { User, WorkspaceAlert } from "@/lib/types";
import { visibleWorkspaceAlerts } from "@/lib/workspace-alerts";

export default function OverviewAlerts({
  alerts,
  user,
}: {
  alerts: WorkspaceAlert[];
  user: User;
}) {
  const [now, setNow] = useState(() => Date.now());
  const visible = useMemo(
    () => visibleWorkspaceAlerts(alerts, user, now),
    [alerts, user, now],
  );
  const [position, setPosition] = useState(0);
  const paused = useRef(false);
  const index = visible.length ? position % visible.length : 0;
  const alert = visible[index];

  useEffect(() => {
    const expiryInterval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(expiryInterval);
  }, []);

  useEffect(() => {
    if (visible.length < 2) return;
    const interval = window.setInterval(() => {
      if (!paused.current && !document.hidden)
        setPosition((current) => current + 1);
    }, 6500);
    return () => window.clearInterval(interval);
  }, [visible.length]);

  if (!alert) return null;
  const move = (direction: number) =>
    setPosition(
      (current) => (current + direction + visible.length) % visible.length,
    );

  return (
    <section
      className="overview-alert"
      aria-label="Company alerts"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <BellRing size={19} aria-hidden="true" />
      <div key={alert.id} className="overview-alert-copy">
        <span>Company alert</span>
        <p>{alert.message}</p>
      </div>
      {visible.length > 1 && (
        <div className="overview-alert-controls">
          <span aria-hidden="true">
            {index + 1} / {visible.length}
          </span>
          <button
            type="button"
            aria-label="Previous company alert"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Next company alert"
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
