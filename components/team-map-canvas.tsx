"use client";

import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as VectorMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import type { LocatedMember } from "@/lib/location";
import { locationAge } from "@/lib/location";
import { currentMapStyleUrl } from "@/lib/map-style";
import { initials } from "@/lib/utils";

const ACCURACY_SOURCE = "team-location-accuracy";
const ACCURACY_FILL = "team-location-accuracy-fill";
const ACCURACY_LINE = "team-location-accuracy-line";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function accuracyFeature(
  longitude: number,
  latitude: number,
  accuracy: number,
  color: string,
): Feature<Polygon, { color: string }> {
  const radius = Math.max(1, accuracy);
  const latitudeRadius = radius / 111_320;
  const longitudeRadius =
    radius / (111_320 * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)));
  const ring: [number, number][] = [];
  for (let index = 0; index <= 48; index++) {
    const angle = (index / 48) * Math.PI * 2;
    ring.push([
      longitude + Math.cos(angle) * longitudeRadius,
      latitude + Math.sin(angle) * latitudeRadius,
    ]);
  }
  return {
    type: "Feature",
    properties: { color },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

function teammatePopup(name: string, detail: string) {
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  const copy = document.createElement("p");
  heading.textContent = name;
  copy.textContent = detail;
  content.append(heading, copy);
  return content;
}

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
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<VectorMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const fitted = useRef(false);
  const previousFit = useRef(fitRevision);
  const previousSelection = useRef("");
  const styleUrl = useRef("");
  const [styleRevision, setStyleRevision] = useState(0);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!container.current || map.current) return;
    styleUrl.current = currentMapStyleUrl();
    const vectorMap = new VectorMap({
      container: container.current,
      style: styleUrl.current,
      center: [-78.6382, 35.7796],
      zoom: 10,
      maxZoom: 20,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    vectorMap.addControl(
      new NavigationControl({ showCompass: false, visualizePitch: false }),
      "top-left",
    );
    vectorMap.scrollZoom.disable();
    const handleStyleReady = () => {
      vectorMap.resize();
      setStyleRevision((revision) => revision + 1);
    };
    vectorMap.on("load", handleStyleReady);
    vectorMap.on("style.load", handleStyleReady);
    vectorMap.on("error", () => setTileError(true));
    vectorMap.on("idle", () => setTileError(false));
    map.current = vectorMap;

    const resize = new ResizeObserver(() => vectorMap.resize());
    resize.observe(container.current);
    const theme = new MutationObserver(() => {
      const nextStyle = currentMapStyleUrl();
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
    if (!vectorMap || !vectorMap.isStyleLoaded()) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const bounds = new LngLatBounds();
    const accuracyFeatures: Feature<Polygon, { color: string }>[] = [];
    let selectedMarker: Marker | null = null;

    for (const member of members) {
      if (!member.location) continue;
      const { latitude, longitude, accuracy } = member.location;
      const age = locationAge(member.location, now);
      if (age.expired) continue;
      const coordinates: [number, number] = [longitude, latitude];
      const color = age.stale ? "#667586" : "#2777c9";
      bounds.extend(coordinates);
      accuracyFeatures.push(
        accuracyFeature(longitude, latitude, accuracy, color),
      );

      const element = document.createElement("button");
      element.type = "button";
      element.textContent = initials(member.name);
      element.className = `teammate-pin ${age.stale ? "stale" : ""} ${selected === member.id ? "selected" : ""}`;
      element.setAttribute("aria-label", `${member.name} · ${age.label}`);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(member.id);
      });

      const detail = `${age.label}${age.stale ? " · Last known location" : ""}. Accuracy about ${Math.round(accuracy)} m.`;
      const marker = new Marker({ element, anchor: "center" })
        .setLngLat(coordinates)
        .setPopup(
          new Popup({ offset: 22, closeButton: false }).setDOMContent(
            teammatePopup(member.name, detail),
          ),
        )
        .addTo(vectorMap);
      markers.current.push(marker);
      if (selected === member.id) selectedMarker = marker;
    }

    const accuracyData: FeatureCollection<Polygon, { color: string }> = {
      type: "FeatureCollection",
      features: accuracyFeatures,
    };
    const source = vectorMap.getSource(ACCURACY_SOURCE) as
      GeoJSONSource | undefined;
    if (source) source.setData(accuracyData);
    else {
      vectorMap.addSource(ACCURACY_SOURCE, {
        type: "geojson",
        data: accuracyData,
      });
      vectorMap.addLayer({
        id: ACCURACY_FILL,
        type: "fill",
        source: ACCURACY_SOURCE,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.08,
        },
      });
      vectorMap.addLayer({
        id: ACCURACY_LINE,
        type: "line",
        source: ACCURACY_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1,
        },
      });
    }

    if (
      !bounds.isEmpty() &&
      (!fitted.current || fitRevision !== previousFit.current)
    ) {
      vectorMap.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14,
        duration: 0,
      });
      fitted.current = true;
    }
    if (selectedMarker) {
      selectedMarker.togglePopup();
      if (previousSelection.current !== selected) {
        vectorMap.easeTo({
          center: selectedMarker.getLngLat(),
          zoom: Math.max(vectorMap.getZoom(), 14),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 350,
        });
      }
    }
    previousFit.current = fitRevision;
    previousSelection.current = selected;
  }, [fitRevision, members, now, selected, styleRevision]);

  return (
    <div className="team-map-visual">
      <div
        ref={container}
        className="team-map-canvas"
        aria-label="Teammate locations map"
      />
      {tileError && (
        <div className="map-tile-error" role="status">
          Some map details could not load. The teammate list still shows the
          latest updates.
        </div>
      )}
    </div>
  );
}
