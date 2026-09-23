"use client";

import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as VectorMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapMouseEvent,
} from "maplibre-gl";
import type { DoorVisit } from "@/lib/types";

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/bright";
const DARK_STYLE = "https://tiles.openfreemap.org/styles/fiord";
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function mapStyle() {
  return document.documentElement.dataset.theme === "dark"
    ? DARK_STYLE
    : LIGHT_STYLE;
}

function markerClass(outcome: DoorVisit["outcome"]) {
  if (outcome === "Lead captured" || outcome === "Interested") return "lead";
  if (outcome === "Not interested") return "declined";
  if (outcome === "Spoke — follow up") return "follow-up";
  return "not-home";
}

function visitPopup(visit: DoorVisit) {
  const content = document.createElement("div");
  content.className = "door-map-popup";
  const title = document.createElement("strong");
  title.textContent = visit.address;
  const details = document.createElement("p");
  details.textContent = visit.outcome;
  const meta = document.createElement("small");
  meta.textContent = `${new Date(visit.visitedAt).toLocaleString()} · ${visit.canvasserName}`;
  content.append(title, details, meta);
  return content;
}

function markerElement(className: string, label: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `door-map-icon ${className}`;
  element.setAttribute("aria-label", label);
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  element.append(dot);
  return element;
}

export default function DoorKnockingMap({
  visits,
  selectedId,
  marking,
  draftPosition,
  onSelect,
  onPick,
}: {
  visits: DoorVisit[];
  selectedId: string;
  marking: boolean;
  draftPosition: { latitude: number; longitude: number } | null;
  onSelect: (id: string) => void;
  onPick: (position: { latitude: number; longitude: number }) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<VectorMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);
  const markingRef = useRef(marking);
  const fitted = useRef(false);
  const styleUrl = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
    onSelectRef.current = onSelect;
    markingRef.current = marking;
  }, [marking, onPick, onSelect]);

  useEffect(() => {
    if (!container.current || map.current) return;
    styleUrl.current = mapStyle();
    const vectorMap = new VectorMap({
      container: container.current,
      style: styleUrl.current,
      center: [-78.6382, 35.7796],
      zoom: 11.25,
      maxZoom: 20,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    vectorMap.addControl(
      new NavigationControl({ showCompass: false, visualizePitch: false }),
      "top-left",
    );
    vectorMap.scrollZoom.disable();
    vectorMap.on("load", () => {
      vectorMap.resize();
      setMapReady(true);
    });
    vectorMap.on("click", (event: MapMouseEvent) => {
      if (markingRef.current)
        onPickRef.current({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        });
    });
    vectorMap.on("error", () => setTileError(true));
    vectorMap.on("idle", () => setTileError(false));
    map.current = vectorMap;

    const resize = new ResizeObserver(() => vectorMap.resize());
    resize.observe(container.current);
    const theme = new MutationObserver(() => {
      const nextStyle = mapStyle();
      if (nextStyle !== styleUrl.current) {
        styleUrl.current = nextStyle;
        vectorMap.setStyle(nextStyle);
      }
    });
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      resize.disconnect();
      theme.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      vectorMap.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const vectorMap = map.current;
    if (!vectorMap || !mapReady) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const bounds = new LngLatBounds();
    let selectedMarker: Marker | null = null;

    for (const visit of visits) {
      const coordinates: [number, number] = [visit.longitude, visit.latitude];
      bounds.extend(coordinates);
      const element = markerElement(
        `${markerClass(visit.outcome)} ${visit.id === selectedId ? "selected" : ""}`,
        `${visit.address} · ${visit.outcome}`,
      );
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(visit.id);
      });
      const marker = new Marker({ element, anchor: "center" })
        .setLngLat(coordinates)
        .setPopup(
          new Popup({ offset: 16, closeButton: false }).setDOMContent(
            visitPopup(visit),
          ),
        )
        .addTo(vectorMap);
      markers.current.push(marker);
      if (visit.id === selectedId) selectedMarker = marker;
    }

    if (draftPosition) {
      const coordinates: [number, number] = [
        draftPosition.longitude,
        draftPosition.latitude,
      ];
      bounds.extend(coordinates);
      const marker = new Marker({
        element: markerElement("draft", "New house marker"),
        anchor: "center",
      })
        .setLngLat(coordinates)
        .addTo(vectorMap);
      markers.current.push(marker);
      vectorMap.easeTo({
        center: coordinates,
        zoom: Math.max(vectorMap.getZoom(), 16.5),
        duration: 450,
      });
    } else if (!bounds.isEmpty() && !fitted.current) {
      vectorMap.fitBounds(bounds, {
        padding: 54,
        maxZoom: 16,
        duration: 0,
      });
      fitted.current = true;
    }

    if (selectedMarker) {
      selectedMarker.togglePopup();
      vectorMap.easeTo({
        center: selectedMarker.getLngLat(),
        zoom: Math.max(vectorMap.getZoom(), 15.5),
        duration: 350,
      });
    }
    container.current?.classList.toggle("is-marking", marking);
  }, [draftPosition, mapReady, marking, selectedId, visits]);

  return (
    <div className="door-map-visual">
      <div
        ref={container}
        className="door-map-canvas"
        aria-label="Door-knocking visits map"
      />
      {marking && (
        <div className="door-map-instruction">Tap the house on the map</div>
      )}
      {tileError && (
        <div className="map-tile-error" role="status">
          Some map details could not load. Saved visits remain available in the
          list.
        </div>
      )}
    </div>
  );
}
