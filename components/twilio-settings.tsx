"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import type { TwilioConnection } from "@/lib/twilio-types";

export default function TwilioSettings({
  demo,
  businessName,
}: {
  demo: boolean;
  businessName: string;
}) {
  const router = useRouter();
  const [connection, setConnection] = useState<TwilioConnection | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) return;
      try {
        const response = await fetch("/api/twilio/config", {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Could not check the Twilio connection.",
          );
        if (!signal?.aborted) setConnection(data);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Could not check the Twilio connection.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [demo],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || demo) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/twilio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountSid, authToken }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not connect Twilio.");
      setConnection(data);
      setAccountSid("");
      setAuthToken("");
      setNotice("Phone account connected. Texting is now available from Team.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect Twilio.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (
      busy ||
      !window.confirm(
        "Disconnect this company's Twilio account? App-link texts will stop.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/twilio/config", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not disconnect Twilio.");
      setConnection(data);
      setNotice("Phone account disconnected. Team texting is now unavailable.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not disconnect Twilio.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="twilio-heading">
      <div className="settings-title">
        <Phone size={22} aria-hidden="true" />
        <div>
          <h2 id="twilio-heading">Phone &amp; texting</h2>
          <p>
            Connect {businessName}&apos;s Twilio account for company texting.
            Only administrators can manage it.
          </p>
        </div>
      </div>
      <div className="settings-form twilio-settings" aria-busy={loading}>
        {demo ? (
          <p className="generation-note">
            Twilio connection details are available in your company workspace.
          </p>
        ) : (
          <>
            {loading && (
              <p className="generation-note" role="status">
                Checking Twilio…
              </p>
            )}
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
            {connection?.managedByPlatform && !connection.configured && (
              <p className="generation-note">
                The platform-managed phone account is not configured yet.
              </p>
            )}
            {connection &&
              !connection.configured &&
              !connection.managedByPlatform && (
                <form className="twilio-connect-form" onSubmit={connect}>
                  <div>
                    <strong>
                      Twilio is not connected. Connect your company phone
                      account
                    </strong>
                    <p className="generation-note">
                      Enter the Account SID and Auth Token from your Twilio
                      console. We verify the account before saving it for this
                      business.
                    </p>
                  </div>
                  <label>
                    Account SID
                    <input
                      value={accountSid}
                      onChange={(event) => setAccountSid(event.target.value)}
                      placeholder="AC…"
                      autoComplete="off"
                      required
                      pattern="AC[0-9a-fA-F]{32}"
                    />
                  </label>
                  <label>
                    Auth Token
                    <input
                      type="password"
                      value={authToken}
                      onChange={(event) => setAuthToken(event.target.value)}
                      autoComplete="new-password"
                      required
                      pattern="[0-9a-fA-F]{32}"
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    {busy ? "Verifying…" : "Connect Twilio"}
                  </button>
                </form>
              )}
            {connection?.account && (
              <>
                <div
                  className={
                    connection.account.status === "active"
                      ? "success-note"
                      : "alert"
                  }
                  role="status"
                >
                  {connection.account.status === "active"
                    ? "Connected · Active account"
                    : `Credentials verified · Account ${connection.account.status}`}
                </div>
                <dl className="twilio-details">
                  <div>
                    <dt>Account</dt>
                    <dd>{connection.account.name}</dd>
                  </div>
                  <div>
                    <dt>Account SID</dt>
                    <dd className="twilio-sid">{connection.account.sid}</dd>
                  </div>
                  <div>
                    <dt>Account type</dt>
                    <dd>
                      {connection.account.type === "Full"
                        ? "Upgraded"
                        : "Trial"}
                    </dd>
                  </div>
                  <div>
                    <dt>Auth Token</dt>
                    <dd>
                      <ShieldCheck size={14} aria-hidden="true" /> Saved
                      securely on server
                    </dd>
                  </div>
                </dl>
                <div className="twilio-numbers">
                  <h3>Company numbers</h3>
                  {connection.numbers.length ? (
                    <ul>
                      {connection.numbers.map((number) => (
                        <li key={number.sid}>
                          <strong>{number.number}</strong>
                          {number.name !== number.number && (
                            <span>{number.name}</span>
                          )}
                          <span>
                            {[
                              number.voice && "Voice",
                              number.sms && "SMS",
                              number.mms && "MMS",
                            ]
                              .filter(Boolean)
                              .join(" · ") ||
                              "No voice or messaging capabilities"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="generation-note">
                      No phone numbers on this Twilio account yet.
                    </p>
                  )}
                  {connection.hasMoreNumbers && (
                    <p className="generation-note">
                      Showing the first 50 numbers.
                    </p>
                  )}
                </div>
                {connection.tollFreeVerification && (
                  <div
                    className={
                      connection.tollFreeVerification.status === "approved"
                        ? "success-note"
                        : "alert"
                    }
                    role="status"
                  >
                    {connection.tollFreeVerification.status === "approved"
                      ? `Text messaging verified for ${connection.tollFreeVerification.number}.`
                      : connection.tollFreeVerification.status === "pending"
                        ? `Text messaging from ${connection.tollFreeVerification.number} is blocked while Twilio reviews its toll-free verification.`
                        : connection.tollFreeVerification.status === "rejected"
                          ? `Text messaging from ${connection.tollFreeVerification.number} is blocked because its toll-free verification was rejected.`
                          : connection.tollFreeVerification.status ===
                              "unverified"
                            ? `Text messaging from ${connection.tollFreeVerification.number} is blocked. Submit Toll-Free Verification in Twilio to enable it.`
                            : `The toll-free verification status for ${connection.tollFreeVerification.number} could not be checked.`}
                  </div>
                )}
                {connection.checkedAt && (
                  <p className="generation-note">
                    Last checked{" "}
                    <time dateTime={connection.checkedAt}>
                      {new Date(connection.checkedAt).toLocaleString()}
                    </time>
                  </p>
                )}
                {!connection.managedByPlatform && (
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    <Unplug size={14} aria-hidden="true" />{" "}
                    {busy ? "Disconnecting…" : "Disconnect phone account"}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setError("");
                setConnection(null);
                void refresh();
              }}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {loading ? "Checking…" : "Check connection"}
            </button>
          </>
        )}
        <p className="generation-note">
          Once connected, administrators can text the {businessName} app link
          from Team. Calling inside the workspace is not enabled yet.
        </p>
      </div>
    </section>
  );
}
