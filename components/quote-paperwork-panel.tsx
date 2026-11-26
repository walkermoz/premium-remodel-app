"use client";

import { FileText, Plus, Send, Tablet, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgreementField,
  AgreementSignerRole,
} from "@/lib/agreement-template-schema";
import type { PaperworkConfiguration } from "@/lib/paperwork-schema";
import type { Quote, User } from "@/lib/types";

type Template = {
  id: string;
  name: string;
  description: string;
  fields: AgreementField[];
  signerRoles: AgreementSignerRole[];
  paperwork: PaperworkConfiguration;
};
type Recipient = {
  id?: string;
  roleId: string;
  name: string;
  email: string;
  label?: string;
  status?: string;
};
type Document = {
  id: string;
  templateId: string;
  title: string;
  status: string;
  revision: number;
  templateVersion: number;
  configuration: PaperworkConfiguration;
  fields: AgreementField[];
  values: Record<string, unknown>;
  recipients: Recipient[];
  completedAt?: string;
};
const statusLabel: Record<string, string> = {
  draft: "Draft",
  sent: "Awaiting completion",
  in_progress: "Partially completed",
  completed: "Completed",
  void: "Voided",
};

function PaperworkDialog({
  title,
  onClose,
  children,
  dismissOnBackdrop = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  dismissOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pointerStartedOutside = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function close() {
    ref.current?.close();
    onClose();
  }
  function isBackdrop(event: {
    target: EventTarget;
    currentTarget: HTMLDialogElement;
    clientX: number;
    clientY: number;
  }) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.target === event.currentTarget &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    );
  }
  return (
    <dialog
      ref={ref}
      className="paperwork-dialog"
      aria-label={title}
      onPointerDown={(event) => {
        pointerStartedOutside.current = dismissOnBackdrop && isBackdrop(event);
      }}
      onClick={(event) => {
        if (
          dismissOnBackdrop &&
          pointerStartedOutside.current &&
          isBackdrop(event)
        )
          close();
        pointerStartedOutside.current = false;
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" className="button secondary" onClick={close}>
          <X size={16} /> Close
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function QuotePaperworkPanel({
  quote,
  user,
  demo,
  canManage,
  canSignInPerson,
  onRefresh,
}: {
  quote: Quote;
  user: User;
  demo: boolean;
  canManage: boolean;
  canSignInPerson: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(!demo && canManage);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [replacing, setReplacing] = useState<Document | null>(null);
  const [refreshFromQuote, setRefreshFromQuote] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Document | null>(null);
  const [delivery, setDelivery] = useState<Document | null>(null);
  const [notify, setNotify] = useState(false);
  const [portalUrl, setPortalUrl] = useState("");
  const load = useCallback(async () => {
    if (demo || !canManage) return;
    try {
      const response = await fetch(`/api/paperwork?quoteId=${quote.id}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not load paperwork.");
      setTemplates(body.templates);
      setDocuments(body.documents);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load paperwork.",
      );
    } finally {
      setLoading(false);
    }
  }, [quote.id, demo, canManage]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, quote.updatedAt]);
  const selected = editing
    ? {
        id: editing.templateId || "",
        name: editing.title,
        description:
          "Auto-filled quote values are preserved. Shared paperwork cannot be edited.",
        fields: editing.fields,
        signerRoles: editing.recipients.map((r, index) => ({
          id: r.roleId,
          label: r.label || r.name,
          partyType: "customer" as const,
          order: index + 1,
          required: true,
          nameBinding: null,
          emailBinding: null,
        })),
        paperwork: editing.configuration,
      }
    : templates.find((t) => t.id === templateId);
  function choose(id: string) {
    setRefreshFromQuote(false);
    setTemplateId(id);
    setValues({});
    setError("");
    const template = templates.find((t) => t.id === id);
    setRecipients(
      (template?.signerRoles || [])
        .filter((role) => role.required)
        .map((role) => ({
          roleId: role.id,
          name: role.partyType === "staff" ? user.name : quote.client,
          email:
            role.partyType === "staff" ? user.email : quote.clientEmail || "",
        })),
    );
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        editing ? `/api/paperwork/${editing.id}` : "/api/paperwork",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            quoteId: quote.id,
            values,
            recipients,
            ...(editing
              ? { revision: editing.revision, refreshFromQuote }
              : {}),
            ...(replacing ? { supersedesId: replacing.id } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not add paperwork.");
      setAdding(false);
      setEditing(null);
      setReplacing(null);
      setTemplateId("");
      await load();
      setMessage(
        editing
          ? "Draft saved."
          : replacing
            ? "Revised draft added. The previous request stays active until you share this copy."
            : "Paperwork added as a draft. Review it before sharing.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add paperwork.",
      );
    } finally {
      setBusy("");
    }
  }
  async function act(document: Document, action: "onsite" | "portal" | "void") {
    setBusy(document.id);
    setError("");
    setMessage("");
    setPortalUrl("");
    try {
      const response = await fetch(`/api/paperwork/${document.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notify: action === "portal" && notify }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Could not update paperwork.");
      if (action === "onsite" && body.url) {
        window.location.assign(body.url);
        return;
      }
      setDelivery(null);
      setPortalUrl(body.portalUrl || "");
      setMessage(
        action === "void"
          ? "Paperwork voided; its history is retained."
          : body.delivery === "failed"
            ? "Published to the customer portal. The email failed; you can copy the portal link below."
            : body.delivery === "sent"
              ? "Published to the customer portal and notification sent."
              : "Published to the customer portal.",
      );
      await load();
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update paperwork.",
      );
    } finally {
      setBusy("");
    }
  }
  if (!canManage)
    return (
      <section className="quote-paperwork">
        <h2>Paperwork</h2>
        <p>Your role does not have access to this business’s paperwork.</p>
      </section>
    );
  return (
    <section className="quote-paperwork" aria-label="Quote paperwork">
      <header className="paperwork-heading">
        <div>
          <h2>Paperwork</h2>
          <p>Forms and documents attached to this quote.</p>
        </div>
        {templates.length > 0 && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setAdding(true);
              setReplacing(null);
              setError("");
            }}
          >
            <Plus size={16} /> Add paperwork
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="paperwork-message">
          {message}
        </p>
      )}
      {portalUrl && (
        <div className="paperwork-link">
          <a href={portalUrl} target="_blank" rel="noopener noreferrer">
            Open customer portal
          </a>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(portalUrl)
                .then(() => setMessage("Portal link copied."))
                .catch(() =>
                  setError("Copy the portal link from Open customer portal."),
                )
            }
          >
            Copy portal link
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading paperwork…</p>
      ) : !documents.length ? (
        <div className="paperwork-empty">
          <FileText size={25} />
          <h3>
            {templates.length
              ? "No paperwork attached"
              : "Paperwork hasn’t been configured"}
          </h3>
          <p>
            {templates.length
              ? "Add a configured form or document when you need it."
              : "Publish templates in Settings to make them available here."}
          </p>
          <Link href="/?view=Settings#business">Configure paperwork</Link>
        </div>
      ) : (
        <div className="paperwork-list">
          {documents.map((document) => (
            <article className="paperwork-row" key={document.id}>
              <div className="paperwork-row-content">
                <FileText size={20} />
                <div>
                  <h3>{document.title}</h3>
                  <p>
                    {document.recipients
                      .map(
                        (r) =>
                          `${r.label || r.name}: ${r.status === "signed" ? "completed" : "pending"}`,
                      )
                      .join(" · ")}
                  </p>
                  <small>
                    Template version {document.templateVersion}
                    {document.completedAt
                      ? ` · Completed ${new Date(document.completedAt).toLocaleDateString()}`
                      : ""}
                  </small>
                </div>
                <span className={`paperwork-status is-${document.status}`}>
                  {statusLabel[document.status] || document.status}
                </span>
              </div>
              <div className="paperwork-actions">
                {document.status === "draft" && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setEditing(document);
                      setRefreshFromQuote(false);
                      setValues(document.values);
                      setRecipients(document.recipients);
                      setAdding(true);
                      setError("");
                    }}
                  >
                    Edit draft
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => setPreview(document)}
                >
                  Preview
                </button>
                <a
                  href={`/api/paperwork/${document.id}/document?download=1`}
                  className="paperwork-download"
                >
                  Download PDF
                </a>
                {!["completed", "void"].includes(document.status) && (
                  <>
                    {document.configuration.inPerson && canSignInPerson && (
                      <button
                        className="button secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void act(document, "onsite")}
                      >
                        <Tablet size={15} />
                        {document.configuration.completion === "signature"
                          ? "Sign in person"
                          : document.configuration.completion === "form"
                            ? "Complete form"
                            : "Review document"}
                      </button>
                    )}
                    {document.configuration.portal &&
                      document.configuration.audience === "customer" && (
                        <button
                          className="button primary"
                          disabled={Boolean(busy)}
                          onClick={() => {
                            setDelivery(document);
                            setNotify(false);
                          }}
                        >
                          <Send size={15} />
                          Send to portal
                        </button>
                      )}
                  </>
                )}
              </div>
              <details>
                <summary>Details & history</summary>
                {document.status !== "draft" &&
                  templates.some((t) => t.id === document.templateId) && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        choose(document.templateId);
                        setValues(document.values);
                        setEditing(null);
                        setReplacing(document);
                        setAdding(true);
                      }}
                    >
                      Prepare revised copy
                    </button>
                  )}
                <p>
                  {document.configuration.audience === "staff"
                    ? "Staff only"
                    : "Customer paperwork"}{" "}
                  ·{" "}
                  {document.configuration.completion === "signature"
                    ? "Signatures required"
                    : document.configuration.completion === "form"
                      ? "Answers required"
                      : "For review"}
                </p>
                <p>
                  {document.recipients
                    .map((r) => `${r.name}${r.email ? ` (${r.email})` : ""}`)
                    .join(" · ")}
                </p>
                {!["completed", "void"].includes(document.status) && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Void this paperwork? Existing completion links will stop working; its history will remain.",
                        )
                      )
                        void act(document, "void");
                    }}
                  >
                    Void paperwork
                  </button>
                )}
              </details>
            </article>
          ))}
        </div>
      )}
      {adding && (
        <PaperworkDialog
          title={editing ? "Edit paperwork draft" : "Add paperwork"}
          onClose={() => {
            setAdding(false);
            setEditing(null);
            setReplacing(null);
          }}
        >
          <form onSubmit={(event) => void add(event)}>
            {!editing && (
              <label>
                Template
                <select
                  value={templateId}
                  onChange={(event) => choose(event.target.value)}
                  required
                  disabled={Boolean(replacing)}
                >
                  <option value="">Choose a template</option>
                  {templates.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && (
              <>
                <p>{selected.description}</p>
                {editing && (
                  <label className="paperwork-checkbox">
                    <input
                      type="checkbox"
                      checked={refreshFromQuote}
                      onChange={(event) =>
                        setRefreshFromQuote(event.target.checked)
                      }
                    />
                    Refresh customer and quote fields when saving
                  </label>
                )}
                {selected.fields.some((f) => f.bindingKey) && (
                  <p className="muted-note">
                    Customer and quote fields fill automatically. You can
                    preview the saved document before sharing.
                  </p>
                )}
                {selected.fields
                  .filter((f) => !f.signerRoleId && !f.bindingKey)
                  .map((field) => (
                    <label key={field.id}>
                      {field.label}
                      {field.type === "multiline_text" ? (
                        <textarea
                          value={String(values[field.id] || "")}
                          required={field.required}
                          onChange={(event) =>
                            setValues({
                              ...values,
                              [field.id]: event.target.value,
                            })
                          }
                        />
                      ) : (
                        <input
                          type={
                            field.type === "checkbox"
                              ? "checkbox"
                              : ["number", "currency"].includes(field.type)
                                ? "number"
                                : field.type === "date"
                                  ? "date"
                                  : "text"
                          }
                          required={field.required}
                          step={field.type === "currency" ? "0.01" : undefined}
                          {...(field.type === "checkbox"
                            ? {
                                checked: Boolean(values[field.id]),
                                onChange: (
                                  event: React.ChangeEvent<HTMLInputElement>,
                                ) =>
                                  setValues({
                                    ...values,
                                    [field.id]: event.target.checked,
                                  }),
                              }
                            : {
                                value: String(values[field.id] ?? ""),
                                onChange: (
                                  event: React.ChangeEvent<HTMLInputElement>,
                                ) =>
                                  setValues({
                                    ...values,
                                    [field.id]: event.target.value,
                                  }),
                              })}
                        />
                      )}
                    </label>
                  ))}
                <h3>
                  {selected.paperwork.completion === "signature"
                    ? "Who signs?"
                    : "Who completes it?"}
                </h3>
                {!editing &&
                  selected.signerRoles
                    .filter((role) => !role.required)
                    .map((role) => (
                      <label className="paperwork-checkbox" key={role.id}>
                        <input
                          type="checkbox"
                          checked={recipients.some((r) => r.roleId === role.id)}
                          onChange={(event) =>
                            setRecipients(
                              event.target.checked
                                ? [
                                    ...recipients,
                                    {
                                      roleId: role.id,
                                      name:
                                        role.partyType === "staff"
                                          ? user.name
                                          : quote.client,
                                      email:
                                        role.partyType === "staff"
                                          ? user.email
                                          : quote.clientEmail || "",
                                    },
                                  ]
                                : recipients.filter(
                                    (r) => r.roleId !== role.id,
                                  ),
                            )
                          }
                        />
                        Include {role.label}
                      </label>
                    ))}
                {recipients.map((recipient, index) => (
                  <div key={recipient.roleId} className="paperwork-recipient">
                    <strong>
                      {
                        selected.signerRoles.find(
                          (r) => r.id === recipient.roleId,
                        )?.label
                      }
                    </strong>
                    <label>
                      Name
                      <input
                        value={recipient.name}
                        required
                        onChange={(event) =>
                          setRecipients(
                            recipients.map((r, i) =>
                              i === index
                                ? { ...r, name: event.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Email (optional for in-person)
                      <input
                        type="email"
                        value={recipient.email}
                        onChange={(event) =>
                          setRecipients(
                            recipients.map((r, i) =>
                              i === index
                                ? { ...r, email: event.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <footer>
              <button
                className="button primary"
                disabled={!selected || Boolean(busy)}
              >
                {busy ? "Saving…" : editing ? "Save draft" : "Add draft"}
              </button>
            </footer>
          </form>
        </PaperworkDialog>
      )}
      {preview && (
        <PaperworkDialog
          title={preview.title}
          onClose={() => setPreview(null)}
          dismissOnBackdrop
        >
          <iframe
            title={`${preview.title} preview`}
            src={`/api/paperwork/${preview.id}/document`}
            className="paperwork-preview"
          />
          <a href={`/api/paperwork/${preview.id}/document?download=1`}>
            Download PDF
          </a>
        </PaperworkDialog>
      )}
      {delivery && (
        <PaperworkDialog
          title="Send paperwork to portal"
          onClose={() => setDelivery(null)}
        >
          <p>
            <strong>{delivery.title}</strong>
          </p>
          <p>The assigned customer will see this paperwork in their portal.</p>
          <p>
            {delivery.recipients
              .map(
                (r) =>
                  `${r.name}${r.email ? ` · ${r.email}` : " · email missing"}`,
              )
              .join("; ")}
          </p>
          {delivery.configuration.email && (
            <label className="paperwork-checkbox">
              <input
                type="checkbox"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
              />
              Notify by email
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <footer>
            <button
              type="button"
              className="button primary"
              disabled={Boolean(busy)}
              onClick={() => void act(delivery, "portal")}
            >
              {busy ? "Publishing…" : "Publish to portal"}
            </button>
          </footer>
        </PaperworkDialog>
      )}
    </section>
  );
}
