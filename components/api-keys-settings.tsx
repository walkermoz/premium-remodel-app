"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import type { ApiKeyRecord } from "@/lib/api-key-types";

export default function ApiKeysSettings({ demo }: { demo: boolean }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Dispatch");
  const [secret, setSecret] = useState("");

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) return;
      try {
        const response = await fetch("/api/admin/api-keys", {
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load API keys.");
        if (!signal?.aborted) setKeys(data.keys || []);
      } catch (err) {
        if (!signal?.aborted)
          setError(
            err instanceof Error ? err.message : "Could not load API keys.",
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

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    if (demo || busy) return;
    setBusy(true);
    setError("");
    setSecret("");
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not create API key.");
      setSecret(data.secret || "");
      setKeys((current) => [data.key, ...current]);
      setName("Dispatch");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create API key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    if (demo || busy) return;
    if (!window.confirm("Revoke this API key? Integrations using it will stop."))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not revoke API key.");
      setKeys((current) =>
        current.map((key) => (key.id === id ? data.key : key)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not revoke API key.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="api-keys-heading">
      <div className="settings-title">
        <KeyRound size={22} aria-hidden="true" />
        <div>
          <h2 id="api-keys-heading">Admin API keys</h2>
          <p>
            Mint and revoke admin-scoped keys for reading NEW leads and writing
            notes, disposition, stage, and approval without the browser.
          </p>
        </div>
      </div>
      <div className="settings-form" aria-busy={loading}>
        {demo ? (
          <p className="generation-note">
            API key management is available in your company workspace.
          </p>
        ) : (
          <>
            {loading && (
              <p className="generation-note" role="status">
                Loading API keys…
              </p>
            )}
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {secret && (
              <div className="success-note" role="status">
                <strong>Copy this secret now.</strong> It is shown once.
                <code className="api-key-secret">{secret}</code>
              </div>
            )}
            <form className="form-row two" onSubmit={createKey}>
              <label>
                Key name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  placeholder="Dispatch"
                />
              </label>
              <div className="settings-inline-actions">
                <button className="button primary" disabled={busy}>
                  {busy && <LoaderCircle size={15} className="spin" />}
                  Create key
                </button>
              </div>
            </form>
            <ul className="api-key-list">
              {keys.map((key) => (
                <li key={key.id}>
                  <div>
                    <strong>{key.name}</strong>
                    <span>
                      {key.keyPrefix}… · created{" "}
                      {new Date(key.createdAt).toLocaleString()}
                      {key.revokedAt
                        ? ` · revoked ${new Date(key.revokedAt).toLocaleString()}`
                        : key.lastUsedAt
                          ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}`
                          : " · unused"}
                    </span>
                  </div>
                  {!key.revokedAt && (
                    <button
                      type="button"
                      className="button secondary small-button"
                      disabled={busy}
                      onClick={() => void revokeKey(key.id)}
                    >
                      <Trash2 size={14} />
                      Revoke
                    </button>
                  )}
                </li>
              ))}
              {!loading && !keys.length && (
                <li className="generation-note">No API keys yet.</li>
              )}
            </ul>
            <p className="generation-note">
              Use <code>Authorization: Bearer sbk_…</code> or{" "}
              <code>X-API-Key</code> with{" "}
              <code>GET/PATCH /api/v1/leads</code>.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
