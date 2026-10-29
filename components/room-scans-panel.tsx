"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Download,
  Maximize2,
  QrCode,
  RefreshCw,
  Ruler,
  Smartphone,
  Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import type { RoomScanSummary } from "@/lib/room-scan-types";
import RoomScanModelViewer from "./room-scan-model-viewer";
import styles from "./room-scans-panel.module.css";

type ScanSession = {
  launchUrl: string;
  expiresAt: string;
  knownIds: Set<string>;
};

function measurement(value: number, suffix: string) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${suffix}`;
}

export default function RoomScansPanel({
  quoteId,
  readOnly,
}: {
  quoteId: string;
  readOnly: boolean;
}) {
  const [scans, setScans] = useState<RoomScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<ScanSession | null>(null);
  const [qr, setQr] = useState("");
  const [completedName, setCompletedName] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/room-scans?quoteId=${encodeURIComponent(quoteId)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not load room scans.");
      const next = result.scans as RoomScanSummary[];
      setScans(next);
      setError("");
      return next;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load room scans.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void QRCode.toDataURL(session.launchUrl, {
      width: 280,
      margin: 1,
      color: { dark: "#0d1a26", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then((value) => {
      if (active) setQr(value);
    });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      void load().then((next) => {
        const added = next?.find((scan) => !session.knownIds.has(scan.id));
        if (added) {
          setCompletedName(added.roomName);
          setSession(null);
        }
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load, session]);

  async function beginScan() {
    setBusy(true);
    setError("");
    setCompletedName("");
    try {
      const response = await fetch("/api/room-scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not start a room scan.");
      setQr("");
      setSession({
        launchUrl: result.launchUrl,
        expiresAt: result.expiresAt,
        knownIds: new Set(scans.map((scan) => scan.id)),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start a room scan.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(scan: RoomScanSummary) {
    if (!window.confirm(`Remove the ${scan.roomName} scan from this quote?`))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/room-scans/${encodeURIComponent(scan.id)}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Could not remove the room scan.");
      setScans((current) => current.filter((item) => item.id !== scan.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove the room scan.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Room scans">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>SITE MEASUREMENTS</span>
          <h2>Room scans</h2>
          <p>
            Capture a measured floor plan and 3D model with a LiDAR-equipped
            iPhone or iPad.
          </p>
        </div>
        <div className={styles.headingActions}>
          <button
            type="button"
            className="button secondary"
            aria-label="Refresh room scans"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
          {!readOnly && (
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void beginScan()}
            >
              <Smartphone size={16} aria-hidden="true" />
              {busy ? "Starting…" : "Scan a room"}
            </button>
          )}
        </div>
      </div>
      {completedName && (
        <p className={styles.success} role="status">
          {completedName} was added to this quote.
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className={styles.empty}>Loading room scans…</div>
      ) : scans.length ? (
        <div className={styles.grid}>
          {scans.map((scan) => (
            <article className={styles.card} key={scan.id}>
              <img
                className={styles.preview}
                src={`/api/room-scans/${encodeURIComponent(scan.id)}/asset?kind=preview`}
                alt={`Floor plan for ${scan.roomName}`}
              />
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>
                  <div>
                    <h3>{scan.roomName}</h3>
                    <p>
                      Scanned by {scan.createdByName} · {scan.device.model}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      className={styles.delete}
                      aria-label={`Remove ${scan.roomName} scan`}
                      disabled={busy}
                      onClick={() => void remove(scan)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className={styles.measurements}>
                  <div>
                    <Ruler size={15} />
                    <span>Floor area</span>
                    <strong>
                      {measurement(scan.measurements.floorAreaSqFt, "sq ft")}
                    </strong>
                  </div>
                  <div>
                    <Ruler size={15} />
                    <span>Wall area</span>
                    <strong>
                      {measurement(scan.measurements.wallAreaSqFt, "sq ft")}
                    </strong>
                  </div>
                  <div>
                    <Maximize2 size={15} />
                    <span>Room size</span>
                    <strong>
                      {measurement(scan.measurements.widthFt, "ft")} ×{" "}
                      {measurement(scan.measurements.depthFt, "ft")}
                    </strong>
                  </div>
                  <div>
                    <Box size={15} />
                    <span>Ceiling</span>
                    <strong>
                      {measurement(scan.measurements.ceilingHeightFt, "ft")}
                    </strong>
                  </div>
                </div>
                <p className={styles.openings}>
                  {scan.measurements.doors} doors · {scan.measurements.windows}{" "}
                  windows · {scan.measurements.openings} openings ·{" "}
                  {measurement(scan.measurements.perimeterFt, "ft perimeter")}
                </p>
                <div className={styles.downloads}>
                  <a
                    className="button secondary small-button"
                    href={`/api/room-scans/${encodeURIComponent(scan.id)}/asset?kind=model`}
                  >
                    <Download size={14} /> USDZ
                  </a>
                  <a
                    className="button secondary small-button"
                    href={`/api/room-scans/${encodeURIComponent(scan.id)}/asset?kind=metadata`}
                  >
                    <Download size={14} /> Measurements
                  </a>
                </div>
                <details className={styles.modelDetails}>
                  <summary>
                    <Box size={15} /> View interactive 3D scan
                  </summary>
                  <RoomScanModelViewer
                    scanId={scan.id}
                    roomName={scan.roomName}
                  />
                </details>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <QrCode size={24} aria-hidden="true" />
          <div>
            <strong>No room scans yet</strong>
            <span>
              Start a scan during the site visit to keep measurements with the
              quote.
            </span>
          </div>
        </div>
      )}
      {session && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSession(null);
          }}
        >
          <div className={`modal ${styles.scanModal}`} role="dialog" aria-modal="true">
            <header>
              <div>
                <span className={styles.eyebrow}>ROOM SCAN</span>
                <h2>Continue on your iPhone</h2>
                <p>
                  Scan this code with the phone that has the Premium Remodel
                  field app installed.
                </p>
              </div>
            </header>
            <div className={styles.qrArea}>
              {qr ? <img src={qr} alt="QR code that opens this room scan" /> : <span>Preparing code…</span>}
              <div>
                <strong>On this phone?</strong>
                <a className="button primary" href={session.launchUrl}>
                  <Smartphone size={16} /> Open room scanner
                </a>
                <a className={styles.installLink} href="/mobile" target="_blank">
                  Install or update the field app
                </a>
              </div>
            </div>
            <p className={styles.expires}>
              This private scan session expires at{" "}
              {new Date(session.expiresAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              . This window will update when the upload finishes.
            </p>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSession(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
