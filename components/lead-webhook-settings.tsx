"use client";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Webhook } from "lucide-react";

export default function LeadWebhookSettings({ demo }: { demo: boolean }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) return;
      try {
        const response = await fetch("/api/admin/lead-webhook", {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load webhook settings.");
        if (!signal?.aborted) {
          setUrl(data.url || "");
          setHasSecret(Boolean(data.hasSecret));
        }
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load webhook settings.",
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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (demo || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/lead-webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          ...(secret ? { secret } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save webhook settings.");
      setUrl(data.url || "");
      setHasSecret(Boolean(data.hasSecret));
      setSecret("");
      setMessage("Lead webhook saved. New website leads POST within seconds.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save webhook settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function clearSecret() {
    if (demo || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/lead-webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearSecret: true }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not clear webhook secret.");
      setHasSecret(Boolean(data.hasSecret));
      setMessage("Webhook signing secret cleared.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not clear webhook secret.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="settings-section"
      aria-labelledby="lead-webhook-heading"
    >
      <div className="settings-title">
        <Webhook size={22} aria-hidden="true" />
        <div>
          <h2 id="lead-webhook-heading">New-lead webhook</h2>
          <p>
            HTTPS endpoint that receives <code>lead.created</code> so Dispatch
            can wake in under about a minute instead of polling.
          </p>
        </div>
      </div>
      <div className="settings-form" aria-busy={loading}>
        {demo ? (
          <p className="generation-note">
            Lead webhook configuration is available in your company workspace.
          </p>
        ) : (
          <form onSubmit={save}>
            {loading && (
              <p className="generation-note" role="status">
                Loading webhook…
              </p>
            )}
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="success-note" role="status">
                {message}
              </div>
            )}
            <label>
              Webhook URL
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://hooks.example.com/servicebuddy-leads"
                maxLength={500}
              />
            </label>
            <label>
              Signing secret {hasSecret ? "(saved — leave blank to keep)" : ""}
              <input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={hasSecret ? "••••••••" : "Optional shared secret"}
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
            <p className="generation-note">
              Posts JSON with lead id, name, project, contact fields, and{" "}
              <code>X-ServiceBuddy-Signature</code> (HMAC-SHA256 of the body)
              when a secret is set. Clear the URL to disable.
            </p>
            <div className="settings-inline-actions">
              <button className="button primary" disabled={busy}>
                {busy && <LoaderCircle size={15} className="spin" />}
                Save webhook
              </button>
              {hasSecret && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void clearSecret()}
                >
                  Clear secret
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
