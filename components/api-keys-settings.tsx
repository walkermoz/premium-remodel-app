"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import {
  apiKeyScopeDetails,
  apiKeyScopes,
  type ApiKeyRecord,
  type ApiKeyScope,
} from "@/lib/api-key-types";

export default function ApiKeysSettings({ demo }: { demo: boolean }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["leads:read"]);
  const [expiresInDays, setExpiresInDays] = useState<30 | 90 | 365 | null>(90);
  const [copied, setCopied] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");

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
        if (!signal?.aborted) {
          setKeys(data.keys || []);
          setCheckedAt(new Date().toISOString());
        }
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
        body: JSON.stringify({ name, scopes, expiresInDays }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not create API key.");
      setSecret(data.secret || "");
      setCopied(false);
      setKeys((current) => [data.key, ...current]);
      setCheckedAt(new Date().toISOString());
      setName("");
      setScopes(["leads:read"]);
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
    if (
      !window.confirm("Revoke this API key? Integrations using it will stop.")
    )
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
          <h2 id="api-keys-heading">Integration API keys</h2>
          <p>
            Give each integration only the lead access it needs. Keys are
            limited to this business and can be revoked at any time.
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
                <strong>New key created. Copy it now.</strong> It will not be
                shown again.
                <code className="api-key-secret">{secret}</code>
                <button
                  type="button"
                  className="button secondary small-button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(secret);
                    setCopied(true);
                  }}
                >
                  <Copy size={14} /> {copied ? "Copied" : "Copy key"}
                </button>
              </div>
            )}
            <form className="api-key-create" onSubmit={createKey}>
              <div className="api-key-create-heading">
                <strong>Create an integration key</strong>
                <span>
                  Permissions are fixed after creation. Replace a key to change
                  its access.
                </span>
              </div>
              <label>
                Integration name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  placeholder="Lead intake automation"
                />
              </label>
              <fieldset className="api-key-scopes">
                <legend>Allowed actions</legend>
                <p>
                  Read access is required because updates return lead details.
                </p>
                {apiKeyScopeDetails.map(({ scope, label, description }) => (
                  <label key={scope} className="api-key-scope-option">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      disabled={scope === "leads:read" || busy}
                      onChange={(event) =>
                        setScopes((current) =>
                          event.target.checked
                            ? apiKeyScopes.filter(
                                (item) =>
                                  item === scope || current.includes(item),
                              )
                            : current.filter((item) => item !== scope),
                        )
                      }
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label>
                Expires after
                <select
                  value={expiresInDays ?? "never"}
                  onChange={(event) =>
                    setExpiresInDays(
                      event.target.value === "never"
                        ? null
                        : (Number(event.target.value) as 30 | 90 | 365),
                    )
                  }
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                  <option value="never">Never</option>
                </select>
              </label>
              <div className="settings-inline-actions">
                <button className="button primary" disabled={busy}>
                  {busy && <LoaderCircle size={15} className="spin" />}
                  Create key
                </button>
              </div>
            </form>
            <div className="api-key-inventory-heading">
              <strong>Issued keys</strong>
              <span>
                {
                  keys.filter(
                    (key) =>
                      !key.revokedAt &&
                      (!key.expiresAt || key.expiresAt > checkedAt),
                  ).length
                }{" "}
                active
              </span>
            </div>
            <ul className="api-key-list">
              {keys.map((key) => {
                const expired = Boolean(
                  key.expiresAt && key.expiresAt <= checkedAt,
                );
                return (
                  <li key={key.id}>
                    <div>
                      <strong>
                        {key.name}{" "}
                        <span className="api-key-status">
                          {key.revokedAt
                            ? "Revoked"
                            : expired
                              ? "Expired"
                              : "Active"}
                        </span>
                      </strong>
                      <span>
                        {key.keyPrefix}… · created{" "}
                        {new Date(key.createdAt).toLocaleString()}
                      </span>
                      <span>
                        {key.expiresAt
                          ? `Expires ${new Date(key.expiresAt).toLocaleDateString()}`
                          : "No expiration"}{" "}
                        ·{" "}
                        {key.lastUsedAt
                          ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}`
                          : "Never used"}
                      </span>
                      <span className="api-key-scope-tags">
                        {key.scopes.map((scope) => (
                          <span key={scope}>
                            {apiKeyScopeDetails.find(
                              (item) => item.scope === scope,
                            )?.label || scope}
                          </span>
                        ))}
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
                );
              })}
              {!loading && !keys.length && (
                <li className="generation-note">No API keys yet.</li>
              )}
            </ul>
            <p className="generation-note">
              Send the key as <code>Authorization: Bearer sbk_…</code>. Read
              leads with <code>GET /api/v1/leads</code> or{" "}
              <code>GET /api/v1/leads/:id</code>; update permitted fields with{" "}
              <code>PATCH /api/v1/leads/:id</code>. Missing permissions return
              403.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
