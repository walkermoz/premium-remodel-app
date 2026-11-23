"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { productVisibility } from "@/lib/product-visibility";
import { MessageSquareText, Unplug } from "lucide-react";
import type { GoogleBusinessStatus } from "@/lib/google-business-types";
import ConnectionSetupGuide from "./connection-setup-guide";

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
      id="connection-google-business"
      className="settings-section"
      aria-labelledby="google-business-heading"
    >
      <div className="settings-title">
        <MessageSquareText size={22} aria-hidden="true" />
        <div>
          <h2 id="google-business-heading">Google reviews</h2>
          <p>
            {productVisibility.analytics
              ? "Show new reviews in Analytics and reply from your business listing."
              : "Prepare your Google Business Profile connection. The review dashboard is currently hidden."}
          </p>
        </div>
      </div>
      <div className="settings-form google-calendar-settings">
        {demo ? (
          <ConnectionSetupGuide
            title="Connect in three steps"
            steps={[
              "Choose the Google account that manages this business’s verified listing.",
              "Approve Google Business Profile access.",
              productVisibility.analytics
                ? "Select the location in Analytics to see and reply to reviews."
                : "Your account will be ready for the review dashboard when it is enabled.",
            ]}
          />
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
              <ConnectionSetupGuide
                title="Waiting for platform setup"
                platform
                steps={[
                  "The ServiceBuddy platform administrator requests Google Business Profile API access and enables the required APIs.",
                  "Create an OAuth web client with this redirect URI: https://servicebuddy-ui.vercel.app/api/google-business/callback.",
                  "Set GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, and GOOGLE_TOKEN_ENCRYPTION_KEY in the production app, then redeploy. Each business can then connect its own listing with Google sign-in.",
                ]}
                resources={[
                  {
                    label: "Open Google Cloud Console",
                    href: "https://console.cloud.google.com/apis/credentials",
                  },
                  {
                    label: "Request Google API access",
                    href: "https://developers.google.com/my-business/content/prereqs",
                  },
                  {
                    label: "Google setup guide",
                    href: "https://developers.google.com/my-business/content/basic-setup",
                  },
                  {
                    label: "Vercel environment variables",
                    href: "https://vercel.com/docs/environment-variables",
                  },
                ]}
              />
            )}
            {status?.configured && !status.connected && (
              <>
                <div className="calendar-connect-card">
                  <div>
                    <strong>Connect a business listing</strong>
                    <p>
                      Sign in with a Google account that owns or manages the
                      verified location.
                    </p>
                  </div>
                  <a
                    className="button primary"
                    href="/api/google-business/connect"
                  >
                    Connect Google
                  </a>
                </div>
                <ConnectionSetupGuide
                  title="What happens next"
                  steps={[
                    "Approve Business Profile management access in Google.",
                    productVisibility.analytics
                      ? "Choose the location in Analytics. New reviews appear there and authorized staff can reply."
                      : "The review dashboard is hidden. Your account connection can be prepared here.",
                  ]}
                />
              </>
            )}
            {status?.connected && (
              <div className="calendar-connect-card">
                <div>
                  <strong>
                    {status.locationTitle ||
                      (productVisibility.analytics
                        ? "Connected — choose a location"
                        : "Google account connected")}
                  </strong>
                  <p>
                    {status.email}
                    {productVisibility.analytics && (
                      <>
                        {" "}
                        · Open Analytics to{" "}
                        {status.locationName
                          ? "view and reply to reviews"
                          : "choose the business location"}
                        .
                      </>
                    )}
                  </p>
                </div>
                <div className="google-business-settings-actions">
                  {productVisibility.analytics && (
                    <Link className="button secondary" href="/?view=Analytics">
                      Open Analytics
                    </Link>
                  )}
                  {!productVisibility.analytics && (
                    <p className="generation-note">
                      The review dashboard is currently hidden. Your connection
                      is retained for when Analytics is enabled.
                    </p>
                  )}
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
