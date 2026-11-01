"use client";

import {
  Building2,
  CalendarClock,
  Download,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRegionalFormat } from "./regional-format-context";

type LifecycleStatus = {
  organization: {
    id: string;
    displayName: string;
    legalName: string;
  };
  deletion: null | {
    id: string;
    status: "pending" | "processing" | "failed";
    requestedAt: string;
    deleteAfter: string;
    processingAt: string | null;
    attemptCount: number;
    lastError: string | null;
  };
};

export default function OrganizationLifecycleSettings({
  demo,
  organizationName,
}: {
  demo: boolean;
  organizationName: string;
}) {
  const regional = useRegionalFormat();
  const [status, setStatus] = useState<LifecycleStatus | null>(
    demo
      ? {
          organization: {
            id: "demo",
            displayName: organizationName,
            legalName: organizationName,
          },
          deletion: null,
        }
      : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState<"export" | "delete" | "cancel" | "">("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) return;
      const response = await fetch("/api/organization-lifecycle", {
        cache: "no-store",
        signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load organization controls.");
      setStatus(body);
    },
    [demo],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal)
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not load organization controls.",
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

  async function exportData() {
    if (demo || busy) return;
    setBusy("export");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/organization-lifecycle/export", {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Could not export organization data.");
      }
      const disposition = response.headers.get("content-disposition") || "";
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] ||
        "servicebuddy-organization-export.zip";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Organization export downloaded.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not export organization data.",
      );
    } finally {
      setBusy("");
    }
  }

  async function changeDeletion(
    action: "request_deletion" | "cancel_deletion",
  ) {
    if (demo || busy || !status) return;
    setBusy(action === "request_deletion" ? "delete" : "cancel");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/organization-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "request_deletion" ? { action, confirmation } : { action },
        ),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not update the deletion request.");
      setStatus((current) =>
        current ? { ...current, deletion: body.deletion || null } : current,
      );
      setConfirmation("");
      setNotice(
        action === "request_deletion"
          ? "Deletion scheduled. You can cancel it any time before the date shown."
          : "Deletion request cancelled. Your business will remain active.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the deletion request.",
      );
    } finally {
      setBusy("");
    }
  }

  const expectedName = status?.organization.displayName || organizationName;

  return (
    <section
      className="settings-section organization-lifecycle-settings"
      aria-labelledby="organization-lifecycle-heading"
    >
      <div className="settings-title">
        <Building2 size={22} aria-hidden="true" />
        <div>
          <h2 id="organization-lifecycle-heading">Data and ownership</h2>
          <p>
            Export this business’s records or schedule removal. These controls
            are available only to organization owners.
          </p>
        </div>
      </div>
      <div className="organization-lifecycle-body">
        {loading ? (
          <p className="generation-note" role="status">
            Loading organization controls…
          </p>
        ) : (
          <>
            <div className="organization-lifecycle-action">
              <div>
                <strong>Export business data</strong>
                <p>
                  Download records, contacts, quotes, workflows, agreement
                  metadata, audit history, and organization-owned uploads in a
                  ZIP archive. Credentials and secret values are excluded.
                </p>
              </div>
              <button
                type="button"
                className="button secondary"
                disabled={demo || Boolean(busy)}
                onClick={() => void exportData()}
              >
                <Download size={14} />
                {busy === "export" ? "Preparing…" : "Download export"}
              </button>
            </div>

            {status?.deletion ? (
              <div className="organization-deletion-pending" role="status">
                <CalendarClock size={20} aria-hidden="true" />
                <div>
                  <strong>
                    {status.deletion.status === "processing"
                      ? "Deletion in progress"
                      : status.deletion.status === "failed"
                        ? "Deletion needs attention"
                        : "Deletion scheduled"}
                  </strong>
                  <p>
                    {status.deletion.status === "processing" ? (
                      "ServiceBuddy is removing organization data and disconnecting external services."
                    ) : status.deletion.status === "failed" ? (
                      "Automatic removal paused safely. ServiceBuddy will retry; contact platform support if this continues."
                    ) : (
                      <>
                        This business is scheduled for removal on{" "}
                        <b>{regional.dateTime(status.deletion.deleteAfter)}</b>.
                        ServiceBuddy remains usable until then.
                      </>
                    )}
                  </p>
                  {status.deletion.lastError && (
                    <small>{status.deletion.lastError}</small>
                  )}
                </div>
                {status.deletion.status !== "processing" && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={() => void changeDeletion("cancel_deletion")}
                  >
                    <RotateCcw size={14} />
                    {busy === "cancel" ? "Cancelling…" : "Cancel deletion"}
                  </button>
                )}
              </div>
            ) : (
              <details className="organization-delete-controls">
                <summary>
                  <span>
                    <Trash2 size={16} aria-hidden="true" /> Delete this business
                  </span>
                  <small>30-day cancellation window</small>
                </summary>
                <div className="organization-delete-confirmation">
                  <p>
                    Scheduling deletion starts a 30-day waiting period. Export
                    your data first. Nothing is removed immediately, and an
                    owner can cancel during the waiting period.
                  </p>
                  <label>
                    Type <strong>{expectedName}</strong> to confirm
                    <input
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button
                    type="button"
                    className="button danger"
                    disabled={
                      demo ||
                      Boolean(busy) ||
                      confirmation.trim() !== expectedName.trim()
                    }
                    onClick={() => void changeDeletion("request_deletion")}
                  >
                    <Trash2 size={14} />
                    {busy === "delete" ? "Scheduling…" : "Schedule deletion"}
                  </button>
                </div>
              </details>
            )}
          </>
        )}
        {demo && (
          <p className="generation-note">
            Data export and deletion controls are disabled in the demo.
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
