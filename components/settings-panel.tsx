"use client";
import { useState } from "react";
import { LockKeyhole, Building2, ExternalLink, MapPin } from "lucide-react";
import type { User } from "@/lib/types";
import { addressPriorityRegion } from "@/lib/address-search";
import GenerationSettings from "./generation-settings";
import { AppearanceSettings } from "./theme-controls";
import { InstallAppPanel } from "./pwa-install";
import TwilioSettings from "./twilio-settings";
import WorkspaceAlertSettings from "./workspace-alert-settings";
import WorkspaceHistorySettings from "./workspace-history-settings";
import GoogleCalendarSettings from "./google-calendar-settings";
import type { WorkspaceAlert } from "@/lib/types";
export default function SettingsPanel({
  user,
  demo,
  alerts,
  onSaveAlert,
  onRemoveAlert,
}: {
  user: User;
  demo: boolean;
  alerts: WorkspaceAlert[];
  onSaveAlert: (
    data: Record<string, unknown>,
    existing?: WorkspaceAlert,
  ) => Promise<unknown>;
  onRemoveAlert: (alert: WorkspaceAlert) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>
            Settings<span className="heading-dot">.</span>
          </h1>
          <p>Your company workspace and account preferences.</p>
        </div>
      </div>
      <AppearanceSettings />
      <InstallAppPanel />
      <GoogleCalendarSettings demo={demo} />
      {user.role === "admin" && (
        <WorkspaceAlertSettings
          alerts={alerts}
          onSave={onSaveAlert}
          onRemove={onRemoveAlert}
        />
      )}
      {user.role === "admin" && <WorkspaceHistorySettings demo={demo} />}
      {user.role === "admin" && <TwilioSettings demo={demo} />}
      <GenerationSettings demo={demo} admin={user.role === "admin"} />
      <div className="settings-section">
        <div className="settings-title">
          <Building2 size={22} />
          <div>
            <h2>Company workspace</h2>
            <p>
              Premium Remodel ·{" "}
              {demo ? "Sample workspace" : "Private company workspace"}
            </p>
          </div>
        </div>
        <div className="settings-details">
          <label>
            Company name
            <input value="Premium Remodel" readOnly />
          </label>
          <label>
            Company website
            <a
              href="https://premiumremodel.com"
              target="_blank"
              rel="noreferrer"
              className="website-field"
            >
              premiumremodel.com
              <ExternalLink size={15} />
            </a>
          </label>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-title">
          <MapPin size={22} />
          <div>
            <h2>Address suggestions</h2>
            <p>
              Wake County address records are searched first. If there is no
              local match, suggestions expand to other U.S. addresses.
            </p>
          </div>
        </div>
        <div className="settings-details">
          <label>
            Priority region
            <input value={addressPriorityRegion.name} readOnly />
          </label>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-title">
          <LockKeyhole size={22} />
          <div>
            <h2>Account security</h2>
            <p>{user.email}</p>
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
                err instanceof Error
                  ? err.message
                  : "Could not update password.",
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
    </>
  );
}
