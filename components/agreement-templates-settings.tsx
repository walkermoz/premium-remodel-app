"use client";

import {
  Archive,
  FilePenLine,
  FileText,
  Plus,
  RotateCcw,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  agreementFieldTypes,
  type AgreementField,
  type AgreementSignerRole,
} from "@/lib/agreement-template-schema";

type DocumentContent = {
  title: string;
  blocks: { id: string; type: "paragraph"; text: string }[];
};

type AgreementTemplate = {
  id: string;
  templateKey: string | null;
  name: string;
  description: string;
  sourceType:
    | "uploaded_pdf"
    | "servicebuddy_document"
    | "legacy_premium_msa";
  status: "draft" | "published" | "archived";
  revision: number;
  currentVersion: number;
  publishedVersion: number | null;
  content: DocumentContent | { renderer: string } | null;
  fields: AgreementField[];
  signerRoles: AgreementSignerRole[];
  originalFilename: string | null;
  fileSha256: string | null;
  pageCount: number | null;
  hasSourceFile: boolean;
  locked: boolean;
  updatedAt: string;
};

const fieldLabels: Record<(typeof agreementFieldTypes)[number], string> = {
  text: "Text",
  multiline_text: "Long text",
  number: "Number",
  currency: "Currency",
  date: "Date",
  checkbox: "Checkbox",
  initials: "Initials",
  signature: "Signature",
};

const createId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

function sourceLabel(source: AgreementTemplate["sourceType"]) {
  if (source === "uploaded_pdf") return "Uploaded PDF";
  if (source === "legacy_premium_msa") return "Current Premium agreement";
  return "ServiceBuddy document";
}

export default function AgreementTemplatesSettings({ demo }: { demo: boolean }) {
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState<"document" | "upload" | null>(null);
  const [draft, setDraft] = useState<AgreementTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(preferredId?: string) {
    if (demo) return;
    const response = await fetch(
      `/api/agreement-templates?includeArchived=${includeArchived}`,
      { cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Could not load agreement templates.");
    setTemplates(body.templates || []);
    const nextTemplate = (body.templates || []).find(
      (template: AgreementTemplate) =>
        template.id === (preferredId || selectedId),
    );
    setSelectedId(nextTemplate?.id || null);
    setDraft(nextTemplate ? structuredClone(nextTemplate) : null);
  }

  useEffect(() => {
    let active = true;
    if (!demo)
      void fetch(`/api/agreement-templates?includeArchived=${includeArchived}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(
              body.error || "Could not load agreement templates.",
            );
          if (active) setTemplates(body.templates || []);
        })
        .catch((cause) => {
          if (active)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not load agreement templates.",
            );
        });
    return () => {
      active = false;
    };
  }, [demo, includeArchived]);

  async function createDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) return setError("Agreement templates require a real workspace.");
    setBusy(true);
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch("/api/agreement-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not create agreement template.");
      await load(body.id);
      setCreating(null);
      setMessage("Agreement draft created.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create agreement template.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadPdf(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) return setError("Agreement templates require a real workspace.");
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/agreement-templates/upload", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not upload agreement template.");
      await load(body.id);
      setCreating(null);
      setMessage("PDF uploaded. Add fields and signer roles before publishing.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload the PDF.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateSigner(index: number, change: Partial<AgreementSignerRole>) {
    if (!draft) return;
    const signerRoles = [...draft.signerRoles];
    signerRoles[index] = { ...signerRoles[index], ...change };
    setDraft({ ...draft, signerRoles });
  }

  function updateField(index: number, change: Partial<AgreementField>) {
    if (!draft) return;
    const fields = [...draft.fields];
    fields[index] = { ...fields[index], ...change };
    setDraft({ ...draft, fields });
  }

  async function persistDraft(template: AgreementTemplate) {
    const response = await fetch(`/api/agreement-templates/${template.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: template.revision,
        name: template.name,
        description: template.description,
        definition: {
          content:
            template.sourceType === "servicebuddy_document"
              ? template.content
              : null,
          fields: template.fields,
          signerRoles: template.signerRoles,
        },
      }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Could not save agreement template.");
    return body as AgreementTemplate;
  }

  async function saveDraft() {
    if (!draft || draft.locked || demo) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await persistDraft(draft);
      await load(body.id);
      setMessage("Agreement draft saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save agreement template.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!draft || draft.locked || demo) return;
    setBusy(true);
    setError("");
    try {
      const latest = await persistDraft(draft);
      const note = window.prompt(
        "What changed in this version?",
        latest.publishedVersion ? "Updated agreement template" : "Initial version",
      );
      if (note === null) {
        await load(latest.id);
        setMessage("Draft saved. Publishing was cancelled.");
        return;
      }
      const response = await fetch(
        `/api/agreement-templates/${draft.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: latest.revision,
            changeNote: note,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not publish agreement template.");
      await load(body.id);
      setMessage(`Version ${body.publishedVersion} published.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not publish agreement template.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(template: AgreementTemplate, archived: boolean) {
    if (demo) return;
    if (archived && !confirm(`Archive ${template.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/agreement-templates/${template.id}${archived ? "" : "/restore"}`,
        { method: archived ? "DELETE" : "POST" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not update agreement template.");
      await load(archived ? undefined : body.id);
      setMessage(archived ? "Agreement archived." : "Agreement restored.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update agreement template.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section agreement-template-settings">
      <div className="settings-title">
        <FileText size={22} />
        <div>
          <h2>Agreement library</h2>
          <p>
            Upload a PDF or build a reusable agreement. Published versions stay
            frozen for signatures and audit history.
          </p>
        </div>
      </div>
      <div className="settings-details">
        <div className="agreement-library-toolbar">
          <div>
            <strong>Templates</strong>
            <label className="compact-check">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeArchived(checked);
                  if (!checked && draft?.status === "archived") {
                    setSelectedId(null);
                    setDraft(null);
                  }
                }}
              />
              Show archived
            </label>
          </div>
          <div>
            <button
              type="button"
              className="button secondary"
              onClick={() => setCreating("document")}
            >
              <FilePenLine size={15} /> Write agreement
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setCreating("upload")}
            >
              <Upload size={15} /> Upload PDF
            </button>
          </div>
        </div>

        {creating && (
          <form
            className="agreement-create-form"
            onSubmit={creating === "upload" ? uploadPdf : createDocument}
          >
            <div className="settings-inline-heading">
              <strong>
                {creating === "upload" ? "Upload agreement PDF" : "New agreement"}
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Close agreement form"
                onClick={() => setCreating(null)}
              >
                <X size={16} />
              </button>
            </div>
            <label>
              Template name
              <input name="name" required maxLength={200} />
            </label>
            <label>
              Description
              <textarea name="description" maxLength={2_000} rows={2} />
            </label>
            {creating === "upload" && (
              <label>
                PDF file
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                />
              </label>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? "Saving…"
                : creating === "upload"
                  ? "Upload PDF"
                  : "Create draft"}
            </button>
          </form>
        )}

        <div className="agreement-library-layout">
          <div className="agreement-template-list" role="list">
            {templates.map((template) => (
              <button
                type="button"
                role="listitem"
                key={template.id}
                className={selectedId === template.id ? "active" : ""}
                onClick={() => {
                  setSelectedId(template.id);
                  setDraft(structuredClone(template));
                }}
              >
                <span>
                  <strong>{template.name}</strong>
                  <small>{sourceLabel(template.sourceType)}</small>
                </span>
                <span className={`agreement-status ${template.status}`}>
                  {template.status}
                  {template.publishedVersion
                    ? ` · v${template.publishedVersion}`
                    : ""}
                </span>
              </button>
            ))}
            {!templates.length && (
              <p className="generation-note">
                No agreement templates yet. Write one or upload a PDF to begin.
              </p>
            )}
          </div>

          {draft && (
            <div className="agreement-template-editor">
              <div className="agreement-editor-heading">
                <div>
                  <span>{sourceLabel(draft.sourceType)}</span>
                  <strong>{draft.name}</strong>
                </div>
                <div>
                  {draft.hasSourceFile && (
                    <a
                      className="button secondary"
                      href={`/api/agreement-templates/${draft.id}/file`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View PDF
                    </a>
                  )}
                  {!draft.locked && draft.status !== "archived" && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Archive ${draft.name}`}
                      onClick={() => void setArchived(draft, true)}
                    >
                      <Archive size={16} />
                    </button>
                  )}
                  {draft.status === "archived" && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => void setArchived(draft, false)}
                    >
                      <RotateCcw size={15} /> Restore
                    </button>
                  )}
                </div>
              </div>

              {draft.locked ? (
                <div className="agreement-locked-note">
                  <strong>Premium Remodel’s live agreement</strong>
                  <p>
                    This registered template preserves the current quote-to-MSA
                    workflow. Its legal terms and signing behavior remain unchanged
                    while the reusable agreement engine is introduced.
                  </p>
                </div>
              ) : (
                <>
                  <div className="form-grid">
                    <label>
                      Name
                      <input
                        value={draft.name}
                        maxLength={200}
                        onChange={(event) =>
                          setDraft({ ...draft, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={draft.description}
                        maxLength={2_000}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  {draft.sourceType === "servicebuddy_document" &&
                    draft.content &&
                    "title" in draft.content && (
                      <div className="agreement-editor-group">
                        <div>
                          <FilePenLine size={16} />
                          <strong>Document</strong>
                        </div>
                        <label>
                          Document title
                          <input
                            value={draft.content.title}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                content: {
                                  ...draft.content as DocumentContent,
                                  title: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Agreement text
                          <textarea
                            rows={10}
                            value={draft.content.blocks[0]?.text || ""}
                            placeholder="Write the agreement terms here."
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                content: {
                                  title: draft.content && "title" in draft.content
                                    ? draft.content.title
                                    : draft.name,
                                  blocks: [
                                    {
                                      id: draft.content && "blocks" in draft.content && draft.content.blocks[0]?.id
                                        ? draft.content.blocks[0].id
                                        : createId("block"),
                                      type: "paragraph",
                                      text: event.target.value,
                                    },
                                  ],
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    )}

                  <div className="agreement-editor-group">
                    <div className="agreement-group-heading">
                      <span>
                        <Users size={16} /> <strong>Signer order</strong>
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            signerRoles: [
                              ...draft.signerRoles,
                              {
                                id: createId("signer"),
                                label: "Additional signer",
                                partyType: "other",
                                order: draft.signerRoles.length + 1,
                                required: true,
                                nameBinding: null,
                                emailBinding: null,
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> Add signer
                      </button>
                    </div>
                    {draft.signerRoles.map((signer, index) => (
                      <div className="agreement-signer-row" key={signer.id}>
                        <input
                          aria-label={`Signer ${index + 1} label`}
                          value={signer.label}
                          onChange={(event) =>
                            updateSigner(index, { label: event.target.value })
                          }
                        />
                        <select
                          aria-label={`${signer.label} party type`}
                          value={signer.partyType}
                          onChange={(event) =>
                            updateSigner(index, {
                              partyType: event.target.value as AgreementSignerRole["partyType"],
                            })
                          }
                        >
                          <option value="customer">Customer</option>
                          <option value="staff">Staff</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          aria-label={`${signer.label} signing order`}
                          type="number"
                          min={1}
                          max={50}
                          value={signer.order}
                          onChange={(event) =>
                            updateSigner(index, { order: Number(event.target.value) })
                          }
                        />
                        <button
                          type="button"
                          className="icon-button delete-action"
                          aria-label={`Remove ${signer.label}`}
                          disabled={draft.signerRoles.length === 1}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              signerRoles: draft.signerRoles.filter(
                                (_, roleIndex) => roleIndex !== index,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="agreement-editor-group">
                    <div className="agreement-group-heading">
                      <span>
                        <FileText size={16} /> <strong>Fields</strong>
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            fields: [
                              ...draft.fields,
                              {
                                id: createId("field"),
                                label: "New field",
                                type: "text",
                                required: false,
                                bindingKey: null,
                                signerRoleId: null,
                                page: draft.sourceType === "uploaded_pdf" ? 1 : null,
                                x: draft.sourceType === "uploaded_pdf" ? 0.1 : null,
                                y: draft.sourceType === "uploaded_pdf" ? 0.1 : null,
                                width: draft.sourceType === "uploaded_pdf" ? 0.3 : null,
                                height: draft.sourceType === "uploaded_pdf" ? 0.05 : null,
                                placeholder: null,
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> Add field
                      </button>
                    </div>
                    {draft.fields.map((field, index) => (
                      <div className="agreement-field-row" key={field.id}>
                        <input
                          aria-label={`Field ${index + 1} label`}
                          value={field.label}
                          onChange={(event) =>
                            updateField(index, { label: event.target.value })
                          }
                        />
                        <select
                          aria-label={`${field.label} type`}
                          value={field.type}
                          onChange={(event) =>
                            updateField(index, {
                              type: event.target.value as AgreementField["type"],
                              signerRoleId: ["signature", "initials"].includes(
                                event.target.value,
                              )
                                ? field.signerRoleId || draft.signerRoles[0]?.id || null
                                : field.signerRoleId,
                            })
                          }
                        >
                          {agreementFieldTypes.map((type) => (
                            <option key={type} value={type}>
                              {fieldLabels[type]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`${field.label} signer`}
                          value={field.signerRoleId || ""}
                          onChange={(event) =>
                            updateField(index, {
                              signerRoleId: event.target.value || null,
                            })
                          }
                        >
                          <option value="">No signer</option>
                          {draft.signerRoles.map((signer) => (
                            <option key={signer.id} value={signer.id}>
                              {signer.label}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${field.label} data binding`}
                          value={field.bindingKey || ""}
                          placeholder="contact.name"
                          onChange={(event) =>
                            updateField(index, {
                              bindingKey: event.target.value || null,
                            })
                          }
                        />
                        {draft.sourceType === "uploaded_pdf" && (
                          <div className="agreement-position-inputs">
                            <input
                              aria-label={`${field.label} page`}
                              title="Page"
                              type="number"
                              min={1}
                              max={draft.pageCount || 500}
                              value={field.page || 1}
                              onChange={(event) =>
                                updateField(index, { page: Number(event.target.value) })
                              }
                            />
                            {(["x", "y", "width", "height"] as const).map((key) => (
                              <input
                                key={key}
                                aria-label={`${field.label} ${key} percent`}
                                title={`${key} %`}
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={Math.round((field[key] || 0) * 1000) / 10}
                                onChange={(event) =>
                                  updateField(index, {
                                    [key]: Number(event.target.value) / 100,
                                  })
                                }
                              />
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          className="icon-button delete-action"
                          aria-label={`Remove ${field.label}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              fields: draft.fields.filter(
                                (_, fieldIndex) => fieldIndex !== index,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {!draft.fields.length && (
                      <p className="generation-note">
                        Add data, checkbox, initials, or signature fields. Data
                        bindings such as contact.name can fill automatically.
                      </p>
                    )}
                    {draft.sourceType === "uploaded_pdf" && draft.fields.length > 0 && (
                      <p className="generation-note">
                        PDF positions use page number and X, Y, width, and height as
                        percentages of the page. A visual drag editor can use these
                        same coordinates without changing the template format.
                      </p>
                    )}
                  </div>

                  <div className="agreement-editor-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || draft.status === "archived"}
                      onClick={() => void saveDraft()}
                    >
                      {busy ? "Saving…" : "Save draft"}
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy || draft.status === "archived"}
                      onClick={() => void publish()}
                    >
                      Publish version
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
