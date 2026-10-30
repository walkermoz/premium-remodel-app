"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Check,
  ExternalLink,
  LoaderCircle,
  Smartphone,
} from "lucide-react";
import type { RoomScanSummary } from "@/lib/room-scan-types";
import styles from "./page.module.css";

type QuoteContext = {
  name: string;
  address: string;
  customer: string;
};

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
    };

function appLink(token: string) {
  const params = new URLSearchParams({ token, server: window.location.origin });
  return `premiumremodelfield://room-scan?${params}`;
}

export default function BrowserRoomScan({ token }: { token: string }) {
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const openAppRef = useRef<HTMLAnchorElement>(null);

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

  useEffect(() => {
    if (!openAppRef.current) return;
    openAppRef.current.href = appLink(token);
    if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    const task = window.setTimeout(() => openAppRef.current?.click(), 450);
    return () => window.clearTimeout(task);
  }, [loading, token]);

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
        ) : error || !session ? (
          <div className={styles.centerState} role="alert">
            <Smartphone size={32} />
            <h1>Room scan unavailable</h1>
            <p>{error || "This room-scan link is unavailable."}</p>
          </div>
        ) : (
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

            {session.completed ? (
              <div className={styles.complete}>
                <span className={styles.completeIcon}>
                  <Check size={31} strokeWidth={2.5} />
                </span>
                <span className={styles.eyebrow}>CAPTURE COMPLETE</span>
                <h2>{session.scan.roomName} was added to the quote</h2>
                <p>
                  The floor plan, measurements, and 3D room are ready in the
                  workspace. You can close this page.
                </p>
              </div>
            ) : (
              <div className={styles.appPrompt}>
                <span className={styles.appIcon}>
                  <Box size={29} />
                </span>
                <span className={styles.eyebrow}>LIDAR ROOM SCAN</span>
                <h2>Open the Premium Remodel field app</h2>
                <p>
                  Room scanning uses the LiDAR sensor and Apple RoomPlan inside
                  the field app. Your browser may ask for permission to open it.
                </p>
                <a ref={openAppRef} className={styles.openButton} href="#">
                  <Smartphone size={19} /> Open scanner app
                  <ExternalLink size={17} />
                </a>
                <p className={styles.installNote}>
                  App not installed? <a href="/mobile">Install or update it</a>,
                  then return to this page.
                </p>
                <small>
                  This private scan session expires at{" "}
                  {new Date(session.expiresAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  .
                </small>
              </div>
            )}
          </>
        )}
      </section>

      <footer className={styles.footer}>
        Secure, expiring room-capture link · Premium Remodel
      </footer>
    </main>
  );
}
