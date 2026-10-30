"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Ruler,
  Smartphone,
} from "lucide-react";
import type {
  RoomScanCapture,
  RoomScanMeasurements,
  RoomScanSummary,
} from "@/lib/room-scan-types";
import styles from "./page.module.css";

type CaptureSession =
  | {
      completed: true;
      expiresAt: string;
      quote: QuoteContext;
      scan: RoomScanSummary;
    }
  | {
      completed: false;
      expiresAt: string;
      quote: QuoteContext;
      uploads: {
        model: { url: string; contentType: string };
        preview: { url: string; contentType: string };
        headers: Record<string, string>;
      };
    };

type QuoteContext = {
  name: string;
  address: string;
  customer: string;
};

type Mode = "choice" | "browser" | "complete";
type Progress = "" | "model" | "preview" | "upload" | "save";

const progressLabels: Record<Exclude<Progress, "">, string> = {
  model: "Building the 3D room…",
  preview: "Drawing the floor plan…",
  upload: "Uploading the room files…",
  save: "Attaching measurements to the quote…",
};

function numberValue(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatFeet(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ft`;
}

async function createRoomModel(
  widthFt: number,
  depthFt: number,
  heightFt: number,
) {
  const THREE = await import("three");
  const { USDZExporter } =
    await import("three/examples/jsm/exporters/USDZExporter.js");
  const feetToMeters = 0.3048;
  const width = widthFt * feetToMeters;
  const depth = depthFt * feetToMeters;
  const height = heightFt * feetToMeters;
  const thickness = 0.075;
  const scene = new THREE.Scene();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8eef4,
    roughness: 0.88,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.94,
  });

  function addBox(
    dimensions: [number, number, number],
    position: [number, number, number],
    material: InstanceType<typeof THREE.MeshStandardMaterial>,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  addBox([width, thickness, depth], [0, -thickness / 2, 0], floorMaterial);
  addBox([width, height, thickness], [0, height / 2, -depth / 2], wallMaterial);
  addBox([width, height, thickness], [0, height / 2, depth / 2], wallMaterial);
  addBox([thickness, height, depth], [-width / 2, height / 2, 0], wallMaterial);
  addBox([thickness, height, depth], [width / 2, height / 2, 0], wallMaterial);

  const bytes = await new USDZExporter().parseAsync(scene);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
  });
  floorMaterial.dispose();
  wallMaterial.dispose();
  return new Blob([bytes], { type: "model/vnd.usdz+zip" });
}

function loadPhoto(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the reference photo."));
    };
    image.src = url;
  });
}

async function createFloorPlan(
  roomName: string,
  measurements: RoomScanMeasurements,
  referencePhoto: File | null,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create a floor plan.");

  context.fillStyle = "#f4f7fa";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#112b3a";
  context.fillRect(0, 0, canvas.width, 118);
  context.fillStyle = "#ffffff";
  context.font = "700 34px Arial, sans-serif";
  context.fillText("PREMIUM REMODEL", 58, 54);
  context.font = "500 20px Arial, sans-serif";
  context.fillStyle = "#bcd5e7";
  context.fillText(`Measured floor plan · ${roomName}`, 58, 88);

  const photoWidth = referencePhoto ? 270 : 0;
  const drawingWidth = 1000 - photoWidth;
  const maxWidth = drawingWidth - 180;
  const maxDepth = 480;
  const scale = Math.min(
    maxWidth / measurements.widthFt,
    maxDepth / measurements.depthFt,
  );
  const planWidth = measurements.widthFt * scale;
  const planDepth = measurements.depthFt * scale;
  const left = 72 + (maxWidth - planWidth) / 2;
  const top = 182 + (maxDepth - planDepth) / 2;

  context.fillStyle = "#ffffff";
  context.strokeStyle = "#347fc4";
  context.lineWidth = 12;
  context.fillRect(left, top, planWidth, planDepth);
  context.strokeRect(left, top, planWidth, planDepth);

  context.fillStyle = "#193b50";
  context.font = "700 26px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText(
    formatFeet(measurements.widthFt),
    left + planWidth / 2,
    top - 28,
  );
  context.save();
  context.translate(left - 36, top + planDepth / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(formatFeet(measurements.depthFt), 0, 0);
  context.restore();
  context.textAlign = "left";

  context.fillStyle = "#ffffff";
  context.strokeStyle = "#d6e1e9";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(58, 690, 1084, 70, 10);
  context.fill();
  context.stroke();
  context.fillStyle = "#5d7383";
  context.font = "600 17px Arial, sans-serif";
  context.fillText(
    `${measurements.floorAreaSqFt.toFixed(1)} sq ft floor  ·  ${measurements.wallAreaSqFt.toFixed(1)} sq ft walls  ·  ${formatFeet(measurements.ceilingHeightFt)} ceiling`,
    84,
    733,
  );

  if (referencePhoto) {
    const photo = await loadPhoto(referencePhoto);
    const x = 888;
    const y = 188;
    const width = 252;
    const height = 330;
    const sourceRatio = photo.width / photo.height;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = photo.width;
    let sourceHeight = photo.height;
    if (sourceRatio > targetRatio) {
      sourceWidth = photo.height * targetRatio;
      sourceX = (photo.width - sourceWidth) / 2;
    } else {
      sourceHeight = photo.width / targetRatio;
      sourceY = (photo.height - sourceHeight) / 2;
    }
    context.drawImage(
      photo,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
    );
    context.fillStyle = "#ffffff";
    context.fillRect(x, y + height, width, 44);
    context.fillStyle = "#405c6e";
    context.font = "600 16px Arial, sans-serif";
    context.fillText("Reference photo", x + 14, y + height + 28);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not save the floor plan.")),
      "image/png",
    );
  });
}

async function uploadFile(
  target: { url: string; contentType: string },
  headers: Record<string, string>,
  body: Blob,
) {
  const response = await fetch(target.url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": target.contentType },
    body,
  });
  if (!response.ok) throw new Error("The room files could not be uploaded.");
}

export default function BrowserRoomScan({ token }: { token: string }) {
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [mode, setMode] = useState<Mode>("choice");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress>("");
  const [roomName, setRoomName] = useState("Room");
  const [widthFt, setWidthFt] = useState("");
  const [depthFt, setDepthFt] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [doors, setDoors] = useState("0");
  const [windows, setWindows] = useState("0");
  const [openings, setOpenings] = useState("0");
  const [photo, setPhoto] = useState<File | null>(null);

  const appUrl = useMemo(() => {
    if (typeof window === "undefined") return "#";
    const params = new URLSearchParams({
      token,
      server: window.location.origin,
    });
    return `premiumremodelfield://room-scan?${params}`;
  }, [token]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/room-scans/capture/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "This room-scan link is unavailable.");
      setSession(result as CaptureSession);
      if (result.completed) setMode("complete");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This room-scan link is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadSession(), 0);
    return () => window.clearTimeout(task);
  }, [loadSession]);

  async function submitMeasurements(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.completed || progress) return;
    const width = numberValue(widthFt);
    const depth = numberValue(depthFt);
    const height = numberValue(heightFt);
    if (width <= 0 || depth <= 0 || height <= 0) {
      setError("Enter the room width, depth, and ceiling height.");
      return;
    }
    setError("");
    const perimeter = 2 * (width + depth);
    const measurements: RoomScanMeasurements = {
      floorAreaSqFt: width * depth,
      wallAreaSqFt: perimeter * height,
      ceilingHeightFt: height,
      perimeterFt: perimeter,
      widthFt: width,
      depthFt: depth,
      doors: Math.max(0, Math.floor(numberValue(doors))),
      windows: Math.max(0, Math.floor(numberValue(windows))),
      openings: Math.max(0, Math.floor(numberValue(openings))),
    };
    try {
      setProgress("model");
      const model = await createRoomModel(width, depth, height);
      setProgress("preview");
      const preview = await createFloorPlan(
        roomName.trim() || "Room",
        measurements,
        photo,
      );
      setProgress("upload");
      await Promise.all([
        uploadFile(session.uploads.model, session.uploads.headers, model),
        uploadFile(session.uploads.preview, session.uploads.headers, preview),
      ]);
      const wallDepth = 0.25;
      const capture: RoomScanCapture = {
        schemaVersion: 1,
        roomName: roomName.trim() || "Room",
        capturedAt: new Date().toISOString(),
        device: {
          model: navigator.platform || "Mobile browser",
          systemName: "Browser",
          systemVersion: navigator.userAgent.slice(0, 60),
        },
        measurements,
        surfaces: [width, width, depth, depth].map((wallWidth) => ({
          id: crypto.randomUUID(),
          kind: "wall" as const,
          widthFt: wallWidth,
          heightFt: height,
          depthFt: wallDepth,
          confidence: "low" as const,
        })),
      };
      setProgress("save");
      const response = await fetch(
        `/api/room-scans/capture/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(capture),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "The room measurements could not be saved.",
        );
      setSession({
        completed: true,
        expiresAt: session.expiresAt,
        quote: session.quote,
        scan: result as RoomScanSummary,
      });
      setMode("complete");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The room measurements could not be saved.",
      );
    } finally {
      setProgress("");
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.brandBar}>
        <Image
          src="/images/logo.png"
          alt="Premium Remodel"
          width={210}
          height={72}
          priority
        />
        <span>Private room capture</span>
      </header>

      <section className={styles.content}>
        {loading ? (
          <div className={styles.centerState} role="status">
            <LoaderCircle className={styles.spinner} size={30} />
            <strong>Opening your room scan…</strong>
          </div>
        ) : error && !session ? (
          <div className={styles.centerState} role="alert">
            <Smartphone size={32} />
            <h1>Room scan unavailable</h1>
            <p>{error}</p>
          </div>
        ) : session ? (
          <>
            <div className={styles.quoteContext}>
              <span>ROOM MEASUREMENTS</span>
              <h1>{session.quote.name || "Project quote"}</h1>
              <p>
                {[session.quote.customer, session.quote.address]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {mode === "choice" && !session.completed && (
              <div className={styles.choice}>
                <div className={styles.intro}>
                  <h2>How would you like to measure this room?</h2>
                  <p>
                    Use the field app for a detailed LiDAR scan, or enter the
                    room dimensions here in your browser.
                  </p>
                </div>
                <div className={styles.choiceList}>
                  <a className={styles.choiceRow} href={appUrl}>
                    <span className={styles.choiceIcon}>
                      <Box size={23} />
                    </span>
                    <span>
                      <strong>Open LiDAR scanner app</strong>
                      <small>
                        Best detail · requires a LiDAR-equipped iPhone or iPad
                      </small>
                    </span>
                    <ExternalLink size={18} />
                  </a>
                  <button
                    type="button"
                    className={styles.choiceRow}
                    onClick={() => setMode("browser")}
                  >
                    <span className={styles.choiceIcon}>
                      <Ruler size={23} />
                    </span>
                    <span>
                      <strong>Continue in browser</strong>
                      <small>
                        Enter dimensions and create a measured floor plan
                      </small>
                    </span>
                    <ChevronRight size={20} />
                  </button>
                </div>
                <p className={styles.installNote}>
                  Don&apos;t have the field app?{" "}
                  <a href="/mobile">Install or update it</a>.
                </p>
              </div>
            )}

            {mode === "browser" && !session.completed && (
              <form className={styles.form} onSubmit={submitMeasurements}>
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={() => {
                    setError("");
                    setMode("choice");
                  }}
                >
                  <ArrowLeft size={17} /> Scan options
                </button>
                <div className={styles.formHeading}>
                  <h2>Enter room measurements</h2>
                  <p>
                    Measure wall to wall. We&apos;ll calculate the floor and
                    wall areas and attach a simple 3D room to the quote.
                  </p>
                </div>
                <label className={styles.fullField}>
                  <span>Room name</span>
                  <input
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    maxLength={120}
                    required
                    autoComplete="off"
                  />
                </label>
                <div className={styles.dimensionGrid}>
                  <label>
                    <span>Width</span>
                    <span className={styles.numberInput}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="1000"
                        step="0.1"
                        value={widthFt}
                        onChange={(event) => setWidthFt(event.target.value)}
                        placeholder="12"
                        required
                      />
                      <b>ft</b>
                    </span>
                  </label>
                  <label>
                    <span>Depth</span>
                    <span className={styles.numberInput}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="1000"
                        step="0.1"
                        value={depthFt}
                        onChange={(event) => setDepthFt(event.target.value)}
                        placeholder="10"
                        required
                      />
                      <b>ft</b>
                    </span>
                  </label>
                  <label>
                    <span>Ceiling height</span>
                    <span className={styles.numberInput}>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="100"
                        step="0.1"
                        value={heightFt}
                        onChange={(event) => setHeightFt(event.target.value)}
                        placeholder="9"
                        required
                      />
                      <b>ft</b>
                    </span>
                  </label>
                </div>
                <fieldset className={styles.openings}>
                  <legend>Openings</legend>
                  <div>
                    <label>
                      <span>Doors</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        value={doors}
                        onChange={(event) => setDoors(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Windows</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        value={windows}
                        onChange={(event) => setWindows(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Other</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        value={openings}
                        onChange={(event) => setOpenings(event.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>
                <label className={styles.photoField}>
                  <span>
                    <strong>Reference photo</strong>
                    <small>Optional · included on the floor plan</small>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) =>
                      setPhoto(event.target.files?.[0] || null)
                    }
                  />
                  <b>{photo ? photo.name : "Take or choose photo"}</b>
                </label>
                <p className={styles.browserNote}>
                  Browser capture uses the dimensions you enter. Open the app
                  instead when you need a detailed LiDAR model of walls,
                  openings, and objects.
                </p>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={Boolean(progress)}
                >
                  {progress ? (
                    <>
                      <LoaderCircle className={styles.spinner} size={19} />
                      {progressLabels[progress]}
                    </>
                  ) : (
                    <>
                      Create room measurements <ChevronRight size={19} />
                    </>
                  )}
                </button>
              </form>
            )}

            {session.completed && (
              <div className={styles.complete}>
                <span className={styles.completeIcon}>
                  <Check size={31} strokeWidth={2.5} />
                </span>
                <span className={styles.completeEyebrow}>CAPTURE COMPLETE</span>
                <h2>{session.scan.roomName} was added to the quote</h2>
                <p>
                  The floor plan, measurements, and 3D room are ready in the
                  workspace. You can close this page.
                </p>
                <div className={styles.completeStats}>
                  <span>
                    <small>Floor area</small>
                    <strong>
                      {session.scan.measurements.floorAreaSqFt.toFixed(1)} sq ft
                    </strong>
                  </span>
                  <span>
                    <small>Room size</small>
                    <strong>
                      {formatFeet(session.scan.measurements.widthFt)} ×{" "}
                      {formatFeet(session.scan.measurements.depthFt)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </>
        ) : null}
      </section>
      <footer className={styles.footer}>
        Secure, expiring room-capture link · Premium Remodel
      </footer>
    </main>
  );
}
