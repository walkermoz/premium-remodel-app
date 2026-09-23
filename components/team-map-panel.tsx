"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  LocateFixed,
  MapPin,
  RefreshCw,
  Square,
  Expand,
  Smartphone,
} from "lucide-react";
import type { User } from "@/lib/types";
import { locationAge, type LocatedMember } from "@/lib/location";
import type { LocationSharing } from "./use-location-sharing";
import { Avatar } from "./ui";
const MapCanvas = dynamic(() => import("./team-map-canvas"), {
  ssr: false,
  loading: () => (
    <div className="team-map-canvas map-loading">Loading map…</div>
  ),
});
export default function TeamMapPanel({
  user,
  demo,
  sharing,
  onInstall,
}: {
  user: User;
  demo: boolean;
  sharing: LocationSharing;
  onInstall: () => void;
}) {
  const [members, setMembers] = useState<LocatedMember[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(""),
    [revision, setRevision] = useState(0),
    [fitRevision, setFitRevision] = useState(0),
    [now, setNow] = useState(Date.now);
  const [demoTime] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        if (demo) {
          setMembers([
            { id: user.id, name: user.name, location: sharing.lastLocation },
            {
              id: "sample-jordan",
              name: "Jordan Lee",
              location: {
                latitude: 35.7915,
                longitude: -78.7811,
                accuracy: 30,
                capturedAt: new Date(demoTime).toISOString(),
              },
            },
            {
              id: "sample-casey",
              name: "Casey Wilson",
              location: {
                latitude: 35.745,
                longitude: -78.603,
                accuracy: 42,
                capturedAt: new Date(demoTime - 12 * 60000).toISOString(),
              },
            },
          ]);
        } else {
          const response = await fetch("/api/locations", {
            cache: "no-store",
            signal: controller.signal,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (!controller.signal.aborted) setMembers(data.members);
        }
        if (!controller.signal.aborted) {
          setLoading(false);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError(
            error instanceof Error
              ? error.message
              : "Could not refresh locations.",
          );
        }
      } finally {
        inFlight = false;
      }
    }
    const first = setTimeout(() => void refresh(), 0),
      timer = setInterval(() => void refresh(), 15000);
    const visible = () => {
      if (!document.hidden) {
        setNow(Date.now());
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      controller.abort();
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [
    demo,
    demoTime,
    user.id,
    user.name,
    sharing.lastLocation,
    sharing.sharing,
    sharing.pendingStop,
    revision,
  ]);
  const displayed = useMemo(
    () =>
      members.map((member) => {
        let point = member.location;
        if (member.id === user.id && sharing.pendingStop) point = null;
        if (
          member.id === user.id &&
          sharing.lastLocation &&
          (!point || sharing.lastLocation.capturedAt > point.capturedAt)
        )
          point = sharing.lastLocation;
        return {
          ...member,
          location: point && !locationAge(point, now).expired ? point : null,
        };
      }),
    [members, sharing.pendingStop, sharing.lastLocation, user.id, now],
  );
  const located = displayed.filter((member) => member.location);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PEOPLE</span>
          <h1>
            Team map<span className="heading-dot">.</span>
          </h1>
          <p>
            {user.role === "admin"
              ? "See the latest locations your teammates choose to share."
              : "Share your location with your company administrators."}
          </p>
        </div>
        <button className="button secondary" onClick={onInstall}>
          <Smartphone size={16} />
          Use on your phone
        </button>
      </div>
      <section
        className={`location-sharing ${sharing.sharing ? "is-sharing" : ""}`}
        aria-label="Your location sharing"
      >
        <LocateFixed size={23} />
        <div>
          <h2>
            {sharing.sharing
              ? "Your location sharing is on"
              : sharing.pendingStop
                ? "Waiting to remove your last position"
                : "Share your location"}
          </h2>
          <p>
            {demo
              ? "Sample mode uses a fictional position and never requests your real location."
              : "Only company administrators can see your location. Updates pause when you leave the app or lock your phone."}
          </p>
          {sharing.lastLocation && (
            <small>
              {locationAge(sharing.lastLocation, now).label} · Accuracy about{" "}
              {Math.round(sharing.lastLocation.accuracy)} m
            </small>
          )}
        </div>
        {sharing.sharing ? (
          <button
            className="button secondary"
            onClick={() => void sharing.stop()}
          >
            <Square size={14} />
            Stop sharing
          </button>
        ) : (
          <button
            className="button primary"
            disabled={sharing.busy || sharing.pendingStop}
            onClick={() => void sharing.start()}
          >
            <LocateFixed size={16} />
            {sharing.busy ? "Getting your location…" : "Share my location"}
          </button>
        )}
      </section>
      {!sharing.sharing &&
        !sharing.pendingStop &&
        displayed.some(
          (member) => member.id === user.id && member.location,
        ) && (
          <button
            className="text-button link remove-saved-location"
            disabled={sharing.busy}
            onClick={() => void sharing.stopAll()}
          >
            Remove my last location and stop sharing on other devices
          </button>
        )}
      {sharing.error && (
        <div className="alert" role="alert">
          {sharing.error}
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setRevision(revision + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {user.role === "admin" ? (
        <>
          <div className="section-heading team-map-heading">
            <div>
              <h2>
                Team locations{" "}
                <span className="count-pill">{located.length}</span>
              </h2>
              <p>
                {demo
                  ? "Fictional sample locations"
                  : "Last known positions · refreshes every 15 seconds"}
              </p>
            </div>
            <div className="team-map-actions">
              <button
                className="button secondary small-button"
                disabled={!located.length}
                onClick={() => {
                  setSelected("");
                  setFitRevision(fitRevision + 1);
                }}
              >
                <Expand size={14} />
                Fit everyone
              </button>
              <button
                className="icon-button"
                aria-label="Refresh locations"
                onClick={() => setRevision(revision + 1)}
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          <div className="team-map-layout">
            <MapCanvas
              members={displayed}
              selected={selected}
              onSelect={setSelected}
              fitRevision={fitRevision}
              now={now}
            />
            <aside
              className="team-location-list"
              aria-label="Teammate location updates"
            >
              {loading && <p>Loading teammates…</p>}
              {!loading && !members.length && <p>No active teammates found.</p>}
              {displayed.map((member) => {
                const age = member.location
                  ? locationAge(member.location, now)
                  : null;
                return (
                  <button
                    className={`team-location-row ${selected === member.id ? "selected" : ""}`}
                    key={member.id}
                    disabled={!member.location}
                    onClick={() => setSelected(member.id)}
                  >
                    <Avatar name={member.name} />
                    <span>
                      <strong>
                        {member.name}
                        {member.id === user.id ? " (you)" : ""}
                      </strong>
                      <span className={age?.stale ? "location-stale" : ""}>
                        {age ? age.label : "No shared location"}
                      </span>
                      {member.location && (
                        <small>
                          {age?.stale ? "Last known · " : ""}Accuracy ±
                          {Math.round(member.location.accuracy)} m
                        </small>
                      )}
                    </span>
                    {member.location && <MapPin size={15} />}
                  </button>
                );
              })}
            </aside>
          </div>
          {!loading && !located.length && (
            <p className="map-empty-note">
              No one has shared a recent location yet. Teammates can open Team
              map and tap Share my location.
            </p>
          )}
          <p className="footnote">
            Older than 2 minutes = last known. Positions disappear after an hour
            without updates. Stop sharing removes your position when connected.
            No route history is kept.
          </p>
        </>
      ) : (
        <p className="footnote">
          The team map is visible to administrators. You control your sharing
          here and can stop at any time.
        </p>
      )}
    </>
  );
}
