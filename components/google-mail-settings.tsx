"use client";

import { useEffect, useState } from "react";
import { Mail, Unplug } from "lucide-react";

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
        `${window.location.pathname}?${params.toString()}`,
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
    <section className="settings-section" aria-labelledby="google-mail-heading">
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
          <p className="generation-note">
            Company email is available in your signed-in workspace.
          </p>
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
              <p className="generation-note">
                Email connections are not available yet. The platform needs a
                one-time Google setup before an administrator can connect your
                company mailbox. Your company does not need to supply OAuth
                credentials.
              </p>
            )}
            {status?.configured && !status.connected && status.canManage && (
              <div className="calendar-connect-card">
                <div>
                  <strong>Connect the company mailbox</strong>
                  <p>
                    Sign in with the mailbox this business will use for quotes.
                    Google will request permission to send email only; the app
                    will not read the inbox.
                  </p>
                </div>
                <a className="button primary" href="/api/google-mail/connect">
                  <Mail size={15} aria-hidden="true" /> Connect Gmail
                </a>
              </div>
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
