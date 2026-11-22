"use client";

import { useEffect, useState } from "react";
import { Mail, Unplug } from "lucide-react";
import ConnectionSetupGuide from "./connection-setup-guide";

type Status = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  canManage: boolean;
};

export default function GoogleMailSettings({ demo }: { demo: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("mail");
    if (result) {
      params.delete("mail");
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}${window.location.hash}`,
      );
    }
    const noticeTimer = window.setTimeout(() => {
      if (result)
        setNotice(
          result === "connected"
            ? "Company Gmail connected. Quotes can now be emailed from the dashboard."
            : result === "denied"
              ? "Gmail access was not approved."
              : result === "expired"
                ? "The Google connection expired. Try again."
                : "Gmail could not be connected. Try again with the company mailbox.",
        );
    }, 0);
    const controller = new AbortController();
    fetch("/api/google-mail", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not check Gmail.");
        setStatus(data);
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : "Could not check Gmail.",
          );
      });
    return () => {
      window.clearTimeout(noticeTimer);
      controller.abort();
    };
  }, [demo]);

  async function disconnect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/google-mail", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not disconnect Gmail.");
      setStatus(data);
      setNotice("Company Gmail disconnected from the dashboard.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not disconnect Gmail.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="connection-google-mail"
      className="settings-section"
      aria-labelledby="google-mail-heading"
    >
      <div className="settings-title">
        <Mail size={22} aria-hidden="true" />
        <div>
          <h2 id="google-mail-heading">
            Company email{" "}
            <span className="connection-optional" aria-hidden="true">
              For quote sending
            </span>
          </h2>
          <p>
            Send quote PDFs from this organization’s connected Google mailbox.
          </p>
        </div>
      </div>
      <div className="settings-form google-calendar-settings">
        {demo ? (
          <ConnectionSetupGuide
            title="Connect in three steps"
            steps={[
              "Choose the Google account that sends this business’s quote emails.",
              "Approve send-only Gmail access. The app does not read the inbox.",
              "Send a test email from Get started to confirm delivery.",
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
              <div
                className={
                  status?.connected ? "success-note" : "generation-note"
                }
                role="status"
              >
                {notice}
              </div>
            )}
            {!status && !error && (
              <p className="generation-note">Checking company email…</p>
            )}
            {status && !status.configured && (
              <ConnectionSetupGuide
                title="Waiting for platform setup"
                platform
                steps={[
                  "The ServiceBuddy platform administrator enables the Gmail API and creates a Google OAuth web client with redirect URI https://servicebuddy-ui.vercel.app/api/google-mail/callback.",
                  "Set GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, and GOOGLE_TOKEN_ENCRYPTION_KEY in the app’s production environment, then redeploy.",
                  "Once configured, this business can connect its mailbox with one Google sign-in. No company API keys are needed.",
                ]}
                resources={[
                  {
                    label: "Open Google Cloud Console",
                    href: "https://console.cloud.google.com/apis/credentials",
                  },
                  {
                    label: "Google OAuth setup",
                    href: "https://developers.google.com/identity/protocols/oauth2/web-server",
                  },
                  {
                    label: "Vercel environment variables",
                    href: "https://vercel.com/docs/environment-variables",
                  },
                ]}
              />
            )}
            {status?.configured && !status.connected && status.canManage && (
              <>
                <div className="calendar-connect-card">
                  <div>
                    <strong>Connect the company mailbox</strong>
                    <p>
                      Choose the Google account this business uses to send
                      quotes.
                    </p>
                  </div>
                  <a className="button primary" href="/api/google-mail/connect">
                    <Mail size={15} aria-hidden="true" /> Connect Gmail
                  </a>
                </div>
                <ConnectionSetupGuide
                  title="What happens next"
                  steps={[
                    "Google asks you to approve permission to send email only.",
                    "Return here and use Get started to send a test email to yourself.",
                  ]}
                />
              </>
            )}
            {status?.configured && !status.connected && !status.canManage && (
              <p className="generation-note">
                An administrator needs to connect the company mailbox before
                quotes can be emailed.
              </p>
            )}
            {status?.connected && (
              <div className="calendar-connect-card">
                <div>
                  <strong>Connected · {status.email}</strong>
                  <p>
                    Quote emails are sent from this mailbox with the generated
                    PDF attached.
                  </p>
                </div>
                {status.canManage && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    <Unplug size={15} aria-hidden="true" />{" "}
                    {busy ? "Disconnecting…" : "Disconnect"}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
