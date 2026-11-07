"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText, Unplug } from "lucide-react";
import type { GoogleBusinessStatus } from "@/lib/google-business-types";

export default function GoogleBusinessSettings({ demo }: { demo: boolean }) {
  const [status, setStatus] = useState<GoogleBusinessStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch("/api/google-business", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not check Google reviews.");
        setStatus(body);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not check Google reviews.",
          );
      });
    return () => controller.abort();
  }, [demo]);

  async function disconnect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/google-business", {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not disconnect Google reviews.");
      setStatus((current) =>
        current
          ? {
              ...current,
              connected: false,
              email: null,
              locationName: null,
              locationTitle: null,
            }
          : null,
      );
      setNotice("Google Business Profile disconnected.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not disconnect Google reviews.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="settings-section"
      aria-labelledby="google-business-heading"
    >
      <div className="settings-title">
        <MessageSquareText size={22} aria-hidden="true" />
        <div>
          <h2 id="google-business-heading">Google reviews</h2>
          <p>
            Show new reviews in Analytics and reply from your business listing.
          </p>
        </div>
      </div>
      <div className="settings-form google-calendar-settings">
        {demo ? (
          <p className="generation-note">
            Connect a verified Google Business Profile in your signed-in
            workspace.
          </p>
        ) : (
          <>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="success-note" role="status">
                {notice}
              </div>
            )}
            {!status && !error && (
              <p className="generation-note">Checking Google reviews…</p>
            )}
            {status && !status.configured && (
              <p className="generation-note">
                Google reviews need one-time platform setup and Google Business
                Profile API approval. Your business does not need to provide
                Google application keys.
              </p>
            )}
            {status?.configured && !status.connected && (
              <div className="calendar-connect-card">
                <div>
                  <strong>Connect a business listing</strong>
                  <p>
                    Sign in with a Google account that owns or manages the
                    verified location. Google will ask for Business Profile
                    management access.
                  </p>
                </div>
                <a
                  className="button primary"
                  href="/api/google-business/connect"
                >
                  Connect Google
                </a>
              </div>
            )}
            {status?.connected && (
              <div className="calendar-connect-card">
                <div>
                  <strong>
                    {status.locationTitle || "Connected — choose a location"}
                  </strong>
                  <p>
                    {status.email} · Open Analytics to{" "}
                    {status.locationName
                      ? "view and reply to reviews"
                      : "choose the business location"}
                    .
                  </p>
                </div>
                <div className="google-business-settings-actions">
                  <Link className="button secondary" href="/?view=Analytics">
                    Open Analytics
                  </Link>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    <Unplug size={15} aria-hidden="true" />{" "}
                    {busy ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
