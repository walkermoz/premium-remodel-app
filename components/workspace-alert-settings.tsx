"use client";
import { useEffect, useState } from "react";
import { BellRing, Clock3, Pencil, Trash2, UserRound } from "lucide-react";
import type { WorkspaceAlert } from "@/lib/types";
import { alertAudienceOptions, audienceLabels } from "@/lib/workspace-alerts";
import { localDateTime } from "@/lib/activity";
import { Modal } from "./ui";

const units = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
} as const;
const unitMaximums: Record<keyof typeof units, number> = {
  minutes: 525600,
  hours: 8760,
  days: 365,
  weeks: 52,
};

export default function WorkspaceAlertSettings({
  alerts,
  onSave,
  onRemove,
}: {
  alerts: WorkspaceAlert[];
  onSave: (
    data: Record<string, unknown>,
    existing?: WorkspaceAlert,
  ) => Promise<unknown>;
  onRemove: (alert: WorkspaceAlert) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unit, setUnit] = useState<keyof typeof units>("hours");
  const [editing, setEditing] = useState<WorkspaceAlert | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const active = alerts.filter((alert) => Date.parse(alert.expiresAt) > now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="settings-section" aria-labelledby="alerts-heading">
      <div className="settings-title">
        <BellRing size={22} aria-hidden="true" />
        <div>
          <h2 id="alerts-heading">Overview alerts</h2>
          <p>
            Post a temporary message at the top of Overview for selected worker
            groups.
          </p>
        </div>
      </div>
      <div className="workspace-alert-settings">
        <form
          className="settings-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            setBusy(true);
            setError("");
            try {
              const form = new FormData(formElement);
              const amount = Number(form.get("duration"));
              const unit = String(form.get("unit")) as keyof typeof units;
              const audiences = form.getAll("audiences").map(String);
              await onSave({
                message: String(form.get("message")),
                audiences,
                durationMinutes: amount * units[unit],
              });
              formElement.reset();
              setMessage("");
              setUnit("hours");
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "Could not post alert.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Alert message
            <textarea
              name="message"
              rows={3}
              maxLength={500}
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Example: Safety meeting tomorrow at 7:30 AM."
            />
            <small>{message.length}/500</small>
          </label>
          <fieldset className="alert-audiences">
            <legend>Who should see it?</legend>
            {alertAudienceOptions.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  name="audiences"
                  value={option.value}
                  defaultChecked
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="alert-duration">
            <span className="alert-duration-label">Duration</span>
            <div className="alert-duration-fields">
              <input
                aria-label="Duration"
                name="duration"
                type="number"
                min="1"
                max={unitMaximums[unit]}
                defaultValue="24"
                required
              />
              <select
                aria-label="Time unit"
                name="unit"
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as keyof typeof units)
                }
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
              </select>
            </div>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            <BellRing size={15} />
            {busy ? "Posting…" : "Post alert"}
          </button>
        </form>
        <div className="active-alerts" aria-label="Active overview alerts">
          <div className="active-alerts-heading">
            <h3>Active alerts</h3>
            <span>{active.length}</span>
          </div>
          {active.length ? (
            <ul>
              {active.map((alert) => (
                <li key={alert.id}>
                  <div>
                    <p>{alert.message}</p>
                    <span>{audienceLabels(alert.audiences)}</span>
                    <small>
                      <UserRound size={12} /> Posted by {alert.authorName} ·{" "}
                      <time dateTime={alert.createdAt}>
                        {new Date(alert.createdAt).toLocaleString()}
                      </time>
                    </small>
                    {alert.lastEditedAt && alert.lastEditedByName && (
                      <small>
                        <Pencil size={11} /> Updated by {alert.lastEditedByName}{" "}
                        ·{" "}
                        <time dateTime={alert.lastEditedAt}>
                          {new Date(alert.lastEditedAt).toLocaleString()}
                        </time>
                      </small>
                    )}
                    <small>
                      <Clock3 size={12} /> Expires{" "}
                      <time dateTime={alert.expiresAt}>
                        {new Date(alert.expiresAt).toLocaleString()}
                      </time>
                    </small>
                  </div>
                  <div className="active-alert-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit alert: ${alert.message}`}
                      onClick={() => {
                        setEditing(alert);
                        setEditMessage(alert.message);
                        setEditExpiresAt(
                          localDateTime(new Date(alert.expiresAt)),
                        );
                        setEditError("");
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button delete-action"
                      aria-label={`Remove alert: ${alert.message}`}
                      onClick={() => onRemove(alert)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="generation-note">No active overview alerts.</p>
          )}
        </div>
      </div>
      {editing && (
        <Modal
          title="Update alert"
          subtitle="Change the message or choose a new expiration time. The audience stays the same."
          onClose={() => {
            if (!editBusy) setEditing(null);
          }}
        >
          <form
            className="entity-form alert-edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setEditBusy(true);
              setEditError("");
              try {
                const expiresAt = new Date(editExpiresAt).toISOString();
                await onSave(
                  {
                    message: editMessage,
                    audiences: editing.audiences,
                    durationMinutes: editing.durationMinutes,
                    expiresAt,
                  },
                  editing,
                );
                setEditing(null);
              } catch (caught) {
                setEditError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not update alert.",
                );
              } finally {
                setEditBusy(false);
              }
            }}
          >
            <div className="form-fields">
              <label>
                Alert message
                <textarea
                  rows={3}
                  maxLength={500}
                  required
                  value={editMessage}
                  onChange={(event) => setEditMessage(event.target.value)}
                />
                <small>{editMessage.length}/500</small>
              </label>
              <label>
                Expires
                <input
                  type="datetime-local"
                  required
                  min={localDateTime(new Date(now + 60_000))}
                  max={localDateTime(new Date(now + 525_600 * 60_000))}
                  value={editExpiresAt}
                  onChange={(event) => setEditExpiresAt(event.target.value)}
                />
                <small>Uses the date and time on this device.</small>
              </label>
              {editError && (
                <div className="alert" role="alert">
                  {editError}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={editBusy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save alert"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
