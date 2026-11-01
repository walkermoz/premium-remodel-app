"use client";

import { CreditCard, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type StripeConnection = {
  id?: string;
  mode: "direct_legacy" | "stripe_connect";
  status: "active" | "restricted" | "pending";
  accountId?: string;
  displayName: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  managedByPlatform?: boolean;
  updatedAt?: string;
};

export default function StripePaymentSettings({ demo }: { demo: boolean }) {
  const [connection, setConnection] = useState<StripeConnection | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (demo) return;
    const response = await fetch("/api/stripe/connect", {
      cache: "no-store",
      signal,
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Could not check the Stripe connection.");
    setConfigured(body.platformConfigured === true);
    setConnection(body.connection || null);
  }, [demo]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal)
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not check the Stripe connection.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  async function connect() {
    if (demo || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/connect", { method: "PUT" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not start Stripe setup.");
      window.location.assign(body.url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start Stripe setup.",
      );
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/stripe/connect", { method: "POST" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not refresh Stripe status.");
      setConnection(body.connection || null);
      setNotice("Stripe status refreshed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh Stripe status.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (
      busy ||
      !confirm(
        "Disconnect Stripe from this business? Existing payment records remain, but new card payments will stop.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/connect", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not disconnect Stripe.");
      setConnection(null);
      setNotice("Stripe disconnected.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not disconnect Stripe.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="stripe-heading">
      <div className="settings-title">
        <CreditCard size={22} aria-hidden="true" />
        <div>
          <h2 id="stripe-heading">Card payments</h2>
          <p>
            Connect this business’s own Stripe account. Customer payments and
            payouts stay in that account.
          </p>
        </div>
      </div>
      <div className="settings-form">
        {demo ? (
          <p className="generation-note">
            Stripe connections are available in a real workspace.
          </p>
        ) : loading ? (
          <p className="generation-note" role="status">
            Checking Stripe…
          </p>
        ) : connection ? (
          <>
            <div
              className={
                connection.chargesEnabled && connection.payoutsEnabled
                  ? "success-note"
                  : "alert"
              }
              role="status"
            >
              {connection.chargesEnabled && connection.payoutsEnabled
                ? `Connected · ${connection.displayName}`
                : "Connected · Stripe needs additional verification before card payments can be collected."}
            </div>
            <dl className="twilio-details">
              <div>
                <dt>Connection</dt>
                <dd>
                  {connection.mode === "direct_legacy"
                    ? "Existing managed account"
                    : "Stripe Connect"}
                </dd>
              </div>
              {connection.accountId && (
                <div>
                  <dt>Account</dt>
                  <dd className="twilio-sid">{connection.accountId}</dd>
                </div>
              )}
              <div>
                <dt>Payments</dt>
                <dd>{connection.chargesEnabled ? "Enabled" : "Restricted"}</dd>
              </div>
              <div>
                <dt>Payouts</dt>
                <dd>{connection.payoutsEnabled ? "Enabled" : "Restricted"}</dd>
              </div>
            </dl>
            <div className="agreement-editor-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || connection.mode === "direct_legacy"}
                onClick={() => void refresh()}
              >
                <RefreshCw size={14} /> {busy ? "Checking…" : "Check status"}
              </button>
              {connection.mode !== "direct_legacy" && (
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  <Unplug size={14} /> Disconnect
                </button>
              )}
            </div>
          </>
        ) : configured ? (
          <div>
            <p className="generation-note">
              Stripe is not connected for this business. You will sign in to
              Stripe and choose or create the account that receives payments.
            </p>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void connect()}
            >
              {busy ? "Opening Stripe…" : "Connect Stripe"}
            </button>
          </div>
        ) : (
          <p className="generation-note">
            Stripe Connect needs one-time ServiceBuddy platform setup. The
            business does not need to supply API keys.
          </p>
        )}
        {notice && <div className="success-note">{notice}</div>}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
