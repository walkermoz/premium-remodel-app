"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { LocatedMember } from "@/lib/location";
import { locationAge } from "@/lib/location";
import { initials } from "@/lib/utils";
export default function TeamMapCanvas({
  members,
  selected,
  onSelect,
  fitRevision,
  now,
}: {
  members: LocatedMember[];
  selected: string;
  onSelect: (id: string) => void;
  fitRevision: number;
  now: number;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    group = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false),
    previousFit = useRef(fitRevision),
    previousSelection = useRef("");
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    if (!map.current) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      map.current = L.map(container.current, {
        scrollWheelZoom: false,
        zoomAnimation: !reduced,
        fadeAnimation: !reduced,
      }).setView([35.7796, -78.6382], 10);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      })
        .on("tileerror", () => setTileError(true))
        .addTo(map.current);
      group.current = L.layerGroup().addTo(map.current);
    }
    group.current!.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const member of members) {
      if (!member.location) continue;
      const { latitude, longitude, accuracy } = member.location;
      const age = locationAge(member.location, now);
      if (age.expired) continue;
      points.push([latitude, longitude]);
      const element = document.createElement("span");
      element.textContent = initials(member.name);
      element.className = `teammate-pin ${age.stale ? "stale" : ""} ${selected === member.id ? "selected" : ""}`;
      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          html: element,
          className: "teammate-map-icon",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
        title: `${member.name} · ${age.label}`,
        alt: member.name,
      });
      const popup = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = member.name;
      const detail = document.createElement("p");
      detail.textContent = `${age.label}${age.stale ? " · Last known location" : ""}. Accuracy about ${Math.round(accuracy)} m.`;
      popup.append(name, detail);
      marker
        .bindPopup(popup)
        .on("click", () => onSelect(member.id))
        .addTo(group.current!);
      L.circle([latitude, longitude], {
        radius: accuracy,
        color: age.stale ? "#6c7986" : "#2777c9",
        weight: 1,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(group.current!);
      if (selected === member.id && previousSelection.current !== selected) {
        map.current.setView(
          [latitude, longitude],
          Math.max(map.current.getZoom(), 14),
          {
            animate: !window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          },
        );
        marker.openPopup();
      }
    }
    if (
      points.length &&
      (!fitted.current || fitRevision !== previousFit.current)
    ) {
      map.current.fitBounds(L.latLngBounds(points), {
        padding: [50, 50],
        maxZoom: 14,
        animate: false,
      });
      fitted.current = true;
    }
    previousFit.current = fitRevision;
    previousSelection.current = selected;
  }, [members, selected, onSelect, fitRevision, now]);
  useEffect(() => {
    const resize = new ResizeObserver(() => map.current?.invalidateSize());
    if (container.current) resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.current?.remove();
      map.current = null;
      group.current = null;
    };
  }, []);
  return (
    <div className="team-map-visual">
      <div
        ref={container}
        className="team-map-canvas"
        aria-label="Teammate locations map"
      />
      {tileError && (
        <div className="map-tile-error" role="status">
          Some map tiles could not load. The teammate list still shows the
          latest updates.
        </div>
      )}
    </div>
  );
}
