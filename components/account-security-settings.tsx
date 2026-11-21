"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
export default function AccountSecuritySettings({
  email,
  demo,
}: {
  email: string;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="settings-section">
      <div className="settings-title">
        <LockKeyhole size={22} />
        <div>
          <h2>Account security</h2>
          <p>{email}</p>
        </div>
      </div>
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage("");
          setError(false);
          if (demo) {
            setError(true);
            setMessage(
              "Password changes are available in your real workspace.",
            );
            return;
          }
          setBusy(true);
          const form = e.currentTarget;
          try {
            const fields = Object.fromEntries(new FormData(form));
            if (fields.password !== fields.confirm)
              throw new Error("The new passwords do not match.");
            const response = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "password", ...fields }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setMessage(
              "Password updated. Other sessions have been signed out.",
            );
            form.reset();
          } catch (err) {
            setError(true);
            setMessage(
              err instanceof Error ? err.message : "Could not update password.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Current password
          <input
            type="password"
            name="current"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <div className="form-grid">
          <label>
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              placeholder="At least 12 characters"
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
        </div>
        {message && (
          <div className={error ? "alert" : "success-note"} role="status">
            {message}
          </div>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
