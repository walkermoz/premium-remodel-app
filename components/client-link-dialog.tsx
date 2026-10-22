"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import type { Project, Quote } from "@/lib/types";
import { Modal } from "./ui";

interface ClientLinkState {
  active: boolean;
  url: string | null;
  createdAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

const emptyState: ClientLinkState = {
  active: false,
  url: null,
  createdAt: null,
  lastViewedAt: null,
  viewCount: 0,
};

function linkDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ClientLinkDialog({
  project,
  kind = "project",
  onClose,
  notify,
}: {
  project: Pick<Project | Quote, "id" | "name" | "status"> & {
    quoteAcceptedAt?: string;
  };
  kind?: "project" | "quote";
  onClose: () => void;
  notify?: (message: string, error?: boolean) => void;
}) {
  const [link, setLink] = useState<ClientLinkState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/client-links?projectId=${encodeURIComponent(project.id)}&kind=${kind}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setLink(result);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load the client link.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [project.id, kind]);

  async function createLink(rotate = false) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/client-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, kind, rotate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setLink(result);
      setCopied(false);
      window.dispatchEvent(new Event("premium-remodel-audit-updated"));
      notify?.(rotate ? "Client link replaced" : "Client link ready");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create the client link.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function disableLink() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/client-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, kind }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setLink(emptyState);
      setCopied(false);
      window.dispatchEvent(new Event("premium-remodel-audit-updated"));
      notify?.("Client link disabled");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not disable the client link.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      notify?.("Client link copied");
    } catch {
      setError("Select and copy the link below.");
    }
  }

  return (
    <Modal
      title={kind === "quote" ? "Client quote link" : "Client project link"}
      subtitle={
        kind === "quote"
          ? "A client-safe quote page with scope, total, and PDF."
          : "A read-only update page you can send to the client."
      }
      onClose={onClose}
    >
      <div className="client-link-dialog">
        {loading ? (
          <div className="client-link-loading" role="status">
            <RefreshCw className="spin" size={18} /> Checking link…
          </div>
        ) : error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : link.active && link.url ? (
          <>
            <div className="client-link-status">
              <span className="client-link-status-icon">
                <Link2 size={18} />
              </span>
              <div>
                <strong>Client access is active</strong>
                <p>
                  {kind === "quote"
                    ? "The page shows a saved version of the quote. Replace this link to publish later edits. Internal costs and workspace notes are excluded."
                    : "The page updates whenever project work changes. Internal costs, contractors, notes, and files are excluded."}
                </p>
              </div>
            </div>
            <label className="client-link-field">
              Shareable URL
              <span>
                <input
                  value={link.url}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="button primary"
                  onClick={() => void copyLink()}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </span>
            </label>
            <div className="client-link-meta">
              <span>
                <small>Created</small>
                <strong>
                  {link.createdAt ? linkDate(link.createdAt) : "Today"}
                </strong>
              </span>
              <span>
                <small>Client views</small>
                <strong className="client-link-view-count">
                  {link.viewCount}
                </strong>
              </span>
              <span>
                <small>Last opened</small>
                <strong>
                  {link.lastViewedAt
                    ? linkDate(link.lastViewedAt)
                    : "Not opened yet"}
                </strong>
              </span>
            </div>
          </>
        ) : (
          <div className="client-link-empty">
            <span>
              <Link2 size={23} />
            </span>
            <h3>
              {kind === "quote"
                ? "Create a private quote page"
                : "Create a private project update page"}
            </h3>
            <p>
              {kind === "quote" &&
              project.status !== "Sent" &&
              !project.quoteAcceptedAt
                ? "Mark this quote as sent before creating a client link."
                : "Anyone with the link can view the client-safe summary. You can replace or disable the link at any time."}
            </p>
          </div>
        )}
      </div>
      <footer className="modal-footer client-link-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Close
        </button>
        {link.active && link.url ? (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() =>
                window.open(link.url!, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink size={15} /> Preview
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => void createLink(true)}
            >
              <RefreshCw size={15} /> Replace
            </button>
            <button
              type="button"
              className="button danger"
              disabled={saving}
              onClick={() => void disableLink()}
            >
              <Link2Off size={15} /> Disable
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={
              saving ||
              loading ||
              (kind === "quote" &&
                project.status !== "Sent" &&
                !project.quoteAcceptedAt)
            }
            onClick={() => void createLink()}
          >
            <Link2 size={15} />
            {saving ? "Creating…" : "Generate link"}
          </button>
        )}
      </footer>
    </Modal>
  );
}
