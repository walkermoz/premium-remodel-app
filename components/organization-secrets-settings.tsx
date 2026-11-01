"use client";

import { KeyRound, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRegionalFormat } from "./regional-format-context";

type SecretSummary = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export default function OrganizationSecretsSettings({
  demo,
}: {
  demo: boolean;
}) {
  const { dateTime } = useRegionalFormat();
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [editing, setEditing] = useState<SecretSummary | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (demo) return;
    const response = await fetch("/api/organization-secrets", {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Could not load workflow secrets.");
    setSecrets(body.secrets || []);
  }

  useEffect(() => {
    let active = true;
    if (!demo)
      void fetch("/api/organization-secrets", { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error || "Could not load workflow secrets.");
          if (active) setSecrets(body.secrets || []);
        })
        .catch((cause) => {
          if (active)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not load workflow secrets.",
            );
        });
    return () => {
      active = false;
    };
  }, [demo]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      setError("Workflow secrets are available in a real workspace.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/organization-secrets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          name: values.name,
          description: values.description,
          value: values.value,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save workflow secret.");
      await load();
      setEditing(undefined);
      setMessage(editing ? "Secret rotated." : "Secret saved.");
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save workflow secret.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(secret: SecretSummary) {
    if (
      demo ||
      !confirm(`Remove ${secret.name}? Workflows using it will stop.`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/organization-secrets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: secret.id, name: secret.name }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not remove workflow secret.");
      setSecrets((current) => current.filter((item) => item.id !== secret.id));
      setMessage("Secret removed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not remove workflow secret.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section organization-secrets-settings">
      <div className="settings-title">
        <KeyRound size={22} />
        <div>
          <h2>Workflow secrets</h2>
          <p>
            Store API keys and signing secrets once, then reference them from
            automations without exposing their values.
          </p>
        </div>
      </div>
      <div className="settings-details">
        <div className="settings-inline-heading">
          <div>
            <strong>Organization vault</strong>
            <span>Values are encrypted and cannot be viewed after saving.</span>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setEditing(null);
              setError("");
              setMessage("");
            }}
          >
            <Plus size={15} /> Add secret
          </button>
        </div>
        {secrets.length > 0 && (
          <div className="secret-list">
            {secrets.map((secret) => (
              <div className="secret-row" key={secret.id}>
                <div>
                  <strong>{secret.name}</strong>
                  <span>{secret.description || "No description"}</span>
                  <small>
                    {secret.lastUsedAt
                      ? `Last used ${dateTime(secret.lastUsedAt)}`
                      : "Not used yet"}
                  </small>
                </div>
                <div className="secret-row-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing(secret)}
                  >
                    <RefreshCw size={14} /> Rotate
                  </button>
                  <button
                    type="button"
                    className="icon-button delete-action"
                    aria-label={`Remove ${secret.name}`}
                    disabled={busy}
                    onClick={() => void remove(secret)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {secrets.length === 0 && editing === undefined && (
          <p className="generation-note">
            No secrets stored. Add one when an HTTPS request or webhook needs
            authentication.
          </p>
        )}
        {editing !== undefined && (
          <form className="secret-form" onSubmit={save}>
            <div className="settings-inline-heading">
              <strong>
                {editing ? `Rotate ${editing.name}` : "Add secret"}
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Close secret editor"
                onClick={() => setEditing(undefined)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label>
                Name
                <input
                  name="name"
                  defaultValue={editing?.name || ""}
                  readOnly={Boolean(editing)}
                  required
                  minLength={2}
                  maxLength={80}
                  pattern="[A-Za-z][A-Za-z0-9_-]{1,79}"
                  placeholder="DISCORD_WEBHOOK_TOKEN"
                />
              </label>
              <label>
                Description
                <input
                  name="description"
                  defaultValue={editing?.description || ""}
                  maxLength={300}
                  placeholder="Used by the sales notification workflow"
                />
              </label>
            </div>
            <label>
              {editing ? "New value" : "Secret value"}
              <input
                name="value"
                type="password"
                autoComplete="new-password"
                required
                maxLength={10_000}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Rotate secret" : "Save secret"}
            </button>
          </form>
        )}
        {message && <div className="success-note">{message}</div>}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
