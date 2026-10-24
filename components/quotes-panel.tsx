"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  FileUp,
} from "lucide-react";
import {
  quoteStatuses,
  type Attachment,
  type Entity,
  type EntityKind,
  type Quote,
  type ScopeItem,
  type User,
  type Workspace,
} from "@/lib/types";
import { projectMoney, scopeTotal } from "@/lib/project-finances";
import { msaPaymentRows } from "@/lib/msa-contract";
import { DEFAULT_QUOTE_PROJECT_NAME } from "@/lib/scope-projects";
import { dateLabel } from "@/lib/utils";
import { Empty } from "./ui";
import type { Editor } from "./entity-form";
import ScopeTable from "./scope-table";
import FilesPanel from "./files-panel";
import QuoteImportDialog from "./quote-import-dialog";
import MsaDraftPanel from "./msa-draft-panel";
import type { ImportedQuote } from "@/lib/quote-import";

export default function QuotesPanel({
  workspace,
  search,
  onNew,
  onOpen,
  onImport,
  demo,
}: {
  workspace: Workspace;
  search: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onImport: (
    quotes: ImportedQuote[],
    options: { combine: boolean; combinedName: string },
  ) => Promise<void>;
  demo: boolean;
}) {
  const [filter, setFilter] = useState("All quotes");
  const [importOpen, setImportOpen] = useState(false);
  const quotes = workspace.quotes || [];
  const visible = quotes
    .filter(
      (quote) =>
        (filter === "All quotes" || quote.status === filter) &&
        `${quote.name} ${quote.client} ${quote.address} ${quote.clientEmail || ""} ${quote.clientPhone || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sent = quotes.filter((quote) => quote.status === "Sent");
  const sentCount = quotes.filter((quote) => Boolean(quote.quoteSentAt)).length;
  const wonCount =
    workspace.projects.filter((project) => Boolean(project.quoteAcceptedAt))
      .length + quotes.filter((quote) => quote.status === "Accepted").length;
  const closeRate =
    sentCount > 0 ? Math.round((wonCount / sentCount) * 1000) / 10 : 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BEFORE THE WORK BEGINS</span>
          <h1>
            Quotes<span className="heading-dot">.</span>
          </h1>
          <p>
            Track quotes through customer approval, agreement signing, and the
            deposit before work moves into Projects.
          </p>
        </div>
        <div className="project-actions">
          {!demo && (
            <button
              className="button secondary"
              onClick={() => setImportOpen(true)}
            >
              <FileUp size={16} /> Import PDFs
            </button>
          )}
          <button className="button primary" onClick={onNew}>
            <Plus size={17} /> New quote
          </button>
        </div>
      </div>
      <div className="quote-summary">
        <FileText size={20} />
        <div>
          <strong>
            {sent.length} {sent.length === 1 ? "quote" : "quotes"} awaiting a
            decision
          </strong>
          <span>
            {projectMoney(
              sent.reduce(
                (sum, quote) => sum + scopeTotal(workspace.scope, quote.id),
                0,
              ),
            )}{" "}
            in sent quotes
          </span>
        </div>
      </div>
      <div className="quote-close-rate" aria-label="Close rate">
        <article>
          <strong>{sentCount}</strong>
          <span>Quotes sent</span>
        </article>
        <article>
          <strong>{wonCount}</strong>
          <span>Quotes won</span>
        </article>
        <article>
          <strong>{closeRate}%</strong>
          <span>Close rate (won ÷ sent)</span>
        </article>
      </div>
      <div className="filter-tabs quote-filters" aria-label="Filter quotes">
        {["All quotes", ...quoteStatuses].map((status) => (
          <button
            key={status}
            className={status === filter ? "active" : ""}
            aria-pressed={status === filter}
            onClick={() => setFilter(status)}
          >
            {status}
            <span>
              {status === "All quotes"
                ? quotes.length
                : quotes.filter((quote) => quote.status === status).length}
            </span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="quote-list">
          {visible.map((quote) => (
            <button
              className="quote-row"
              key={quote.id}
              onClick={() => onOpen(quote.id)}
            >
              <div className="quote-row-info">
                <strong>{quote.name}</strong>
                <span>{quote.client || "No client added"}</span>
                <small>
                  <MapPin size={12} />
                  {quote.address || "No address added"}
                </small>
              </div>
              <div className="quote-row-price">
                <strong>
                  {projectMoney(scopeTotal(workspace.scope, quote.id))}
                </strong>
                <span>Scope total</span>
              </div>
              <div className="quote-row-status">
                <span
                  className={`quote-status quote-status-${quote.status.toLowerCase()}`}
                >
                  {quote.status}
                </span>
                <small>
                  {quote.status === "Sent" && quote.quoteSentAt
                    ? `Sent ${dateLabel(quote.quoteSentAt)}`
                    : `Updated ${dateLabel(quote.updatedAt)}`}
                </small>
              </div>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title={
            quotes.length
              ? "No matching quotes"
              : "Your next project starts with a quote"
          }
          text={
            quotes.length
              ? "Try another status or search."
              : "Add a lead, build the scope and price, then mark the quote as sent."
          }
          action={
            <button className="button secondary" onClick={onNew}>
              <Plus size={15} />
              New quote
            </button>
          }
        />
      )}
      {importOpen && (
        <QuoteImportDialog
          onClose={() => setImportOpen(false)}
          onImport={onImport}
        />
      )}
    </>
  );
}

export function QuoteDetail({
  quote,
  workspace,
  user,
  demo,
  onBack,
  onEdit,
  onSave,
  onSaveScopeBatch,
  onAccept,
  onDelete,
  onUpload,
  onSent,
  onProjectReady,
}: {
  quote: Quote;
  workspace: Workspace;
  user: User;
  demo: boolean;
  onBack: () => void;
  onEdit: (editor: Editor) => void;
  onSave: (
    kind: EntityKind,
    data: Record<string, unknown>,
    entity?: Entity,
  ) => Promise<Entity>;
  onSaveScopeBatch: (rows: Record<string, unknown>[]) => Promise<ScopeItem[]>;
  onAccept: (quote: Quote) => Promise<void>;
  onDelete: (kind: EntityKind, entity: Entity) => void;
  onUpload: (file: File, projectId: string) => Promise<Attachment>;
  onSent: () => Promise<void>;
  onProjectReady: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendRequestId, setSendRequestId] = useState("");
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checkRequestId, setCheckRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const items = workspace.scope.filter((item) => item.projectId === quote.id);
  const files = workspace.attachments.filter(
    (file) => file.projectId === quote.id,
  );
  const signedScope =
    quote.status === "Accepted" && Boolean(quote.quoteAcceptance);
  const signedMsa = quote.msaAgreement?.status === "signed";
  const depositCents = signedMsa
    ? Math.round(msaPaymentRows(quote.msaAgreement!)[0]?.amount * 100)
    : 0;
  const paidCents = (workspace.activities || [])
    .filter(
      (item) =>
        item.projectId === quote.id && item.activityType === "Payment received",
    )
    .reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0);
  const dueCents = Math.max(0, depositCents - paidCents);
  const readyForProjects =
    signedScope && signedMsa && depositCents > 0 && dueCents === 0;
  async function recordCheck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkBusy) return;
    setCheckBusy(true);
    setCheckError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/check-deposit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: checkRequestId,
            amount: String(form.get("amount") || ""),
            checkReference: String(form.get("checkReference") || ""),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not record the check.");
      if (result.projectReady) onProjectReady(quote.id);
      await onSent();
      setCheckRequestId(crypto.randomUUID());
    } catch (cause) {
      setCheckError(
        cause instanceof Error ? cause.message : "Could not record the check.",
      );
    } finally {
      setCheckBusy(false);
    }
  }
  async function change(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not update this quote.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openEmail() {
    setError("");
    try {
      const response = await fetch("/api/google-mail", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not check company email.");
      if (!data.connected)
        throw new Error(
          "Connect contact@premiumremodel.com in Settings before sending a quote.",
        );
      setSendRequestId(crypto.randomUUID());
      setSendError("");
      setSendOpen(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not check company email.",
      );
    }
  }
  async function sendEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendBusy) return;
    if (
      (quote.quoteSentAt || quote.status === "Sent") &&
      !window.confirm(
        "This quote has already been sent. Are you sure you want to email it again?",
      )
    )
      return;
    setSendBusy(true);
    setSendError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quote.id)}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: sendRequestId,
            recipientEmail: quote.clientEmail,
            subject: String(form.get("subject") || ""),
            message: String(form.get("message") || ""),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send quote.");
      setSendOpen(false);
      try {
        await onSent();
      } catch {
        setError(
          "Gmail sent the quote, but the workspace could not refresh. Reload to see the updated status.",
        );
      }
      if (data.warning) setError(data.warning);
    } catch (caught) {
      setSendError(
        caught instanceof Error ? caught.message : "Could not send quote.",
      );
    } finally {
      setSendBusy(false);
    }
  }
  return (
    <div className="quote-detail">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        All quotes
      </button>
      <div className="project-heading">
        <div>
          <h1>{quote.name}</h1>
          <div className="project-address">
            <MapPin size={15} />
            {quote.address || "No address added"}
            <span className="address-divider">·</span>
            {quote.client || "No client added"}
          </div>
        </div>
        <div className="project-actions">
          {!demo && quote.clientEmail && !signedScope && (
            <button
              className="button primary"
              disabled={busy || sendBusy}
              onClick={() => void openEmail()}
            >
              <Mail size={15} /> Email quote
            </button>
          )}
          <a
            className="button secondary"
            href={`/api/quotes/${encodeURIComponent(quote.id)}/pdf`}
            download
          >
            <Download size={15} />
            Download PDF
          </a>
          {!signedScope && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onEdit({ kind: "quote", entity: quote })}
            >
              <Pencil size={15} /> Edit quote
            </button>
          )}
          {readyForProjects && !demo && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void change(() => onAccept(quote))}
            >
              <Check size={16} /> {busy ? "Saving…" : "Move to Projects"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {sendOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sendBusy)
              setSendOpen(false);
          }}
        >
          <form
            className="modal"
            onSubmit={(event) => void sendEmail(event)}
            aria-label="Email quote"
          >
            <header>
              <div>
                <h2>Email quote</h2>
                <p>
                  The generated PDF will be attached from
                  contact@premiumremodel.com.
                </p>
              </div>
            </header>
            <div className="form-fields">
              <label>
                To
                <input type="email" value={quote.clientEmail} readOnly />
              </label>
              <label>
                Subject
                <input
                  name="subject"
                  defaultValue={`Premium Remodel Quote${quote.quoteNumber ? ` #${quote.quoteNumber}` : ""}`}
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Message
                <textarea
                  name="message"
                  defaultValue={`Hi ${quote.client || "there"},\n\nAttached is your Premium Remodel quote. Please review it and reply to this email with any questions.\n\nThanks,\nPremium Remodel Team`}
                  required
                  rows={7}
                  maxLength={5000}
                />
              </label>
              {sendError && (
                <div className="alert" role="alert">
                  {sendError}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={sendBusy}
                onClick={() => setSendOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={sendBusy}
              >
                {sendBusy ? "Sending…" : "Email quote"}
              </button>
            </footer>
          </form>
        </div>
      )}
      <div className="quote-status-line">
        <span className="badge badge-category">
          {quote.category || "Remodel"}
        </span>
        <label>
          Quote status
          <select
            aria-label="Quote status"
            value={quote.status}
            disabled={busy || signedScope}
            onChange={(event) =>
              void change(() =>
                onSave(
                  "quote",
                  { ...quote, status: event.target.value },
                  quote,
                ),
              )
            }
          >
            {quoteStatuses
              .filter((status) => status !== "Accepted" || signedScope)
              .map((status) => (
                <option key={status}>{status}</option>
              ))}
          </select>
        </label>
        {quote.quoteSentAt && (
          <span className="muted">
            Last sent {dateLabel(quote.quoteSentAt)}
          </span>
        )}
      </div>
      <div className="quote-overview">
        <div className="quote-price">
          <span>Scope total · quote price</span>
          <strong>{projectMoney(scopeTotal(items))}</strong>
          <small>{items.length} scope items</small>
        </div>
        <div className="quote-contact">
          <strong>{quote.client || "Client details"}</strong>
          {quote.clientEmail && (
            <a href={`mailto:${quote.clientEmail}`}>
              <Mail size={14} />
              {quote.clientEmail}
            </a>
          )}
          {quote.clientPhone && (
            <a href={`tel:${quote.clientPhone.replace(/[^+\d]/g, "")}`}>
              <Phone size={14} />
              {quote.clientPhone}
            </a>
          )}
          {!quote.clientPhone && !quote.clientEmail && (
            <span>Add client contact details in Edit quote.</span>
          )}
        </div>
      </div>
      {quote.description && (
        <section className="content-section">
          <div className="section-heading">
            <h2>Scope brief</h2>
          </div>
          <p className="scope-description">{quote.description}</p>
        </section>
      )}
      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Scope & pricing</h2>
            <p>
              {signedScope
                ? "Signed scope is locked."
                : "Edit any cell. Each row saves when you leave it or press Enter."}
            </p>
          </div>
        </div>
        {signedScope ? (
          <table className="scope-table" aria-label="Signed quote scope">
            <thead>
              <tr>
                <th>Work item</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    {item.details && <small>{item.details}</small>}
                  </td>
                  <td>{projectMoney(item.estimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ScopeTable
            items={items}
            workspace={workspace}
            inline
            showStatus={false}
            projectId={quote.id}
            defaultSectionName={DEFAULT_QUOTE_PROJECT_NAME}
            templateProject={{
              projectName: "",
              customerName: quote.client,
              customerPhone: quote.clientPhone || "",
              customerEmail: quote.clientEmail || "",
              address: quote.address,
              preferredStartDate: quote.startDate,
            }}
            onSaveTemplateProject={(project) =>
              onSave(
                "quote",
                {
                  ...quote,
                  client: project.customerName,
                  clientPhone: project.customerPhone,
                  clientEmail: project.customerEmail,
                  address: project.address,
                  startDate: project.preferredStartDate,
                },
                quote,
              )
            }
            onSave={(data, item) => onSave("scope", data, item)}
            onSaveMany={onSaveScopeBatch}
            onDelete={(item) => onDelete("scope", item)}
          />
        )}
      </section>
      {signedScope && (
        <MsaDraftPanel
          key={`${quote.id}:${JSON.stringify(quote.msaPaymentSchedule)}:${quote.msaPermitResponsibility || ""}:${JSON.stringify(quote.msaContractTerms)}`}
          project={quote}
          items={items}
          signer={user}
          onSaveTerms={async (terms) => {
            const response = await fetch(
              `/api/msa/${encodeURIComponent(quote.id)}/terms`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updatedAt: quote.updatedAt, ...terms }),
              },
            );
            const result = await response.json();
            if (!response.ok)
              throw new Error(result.error || "Could not save MSA terms.");
            await onSent();
          }}
        />
      )}
      {signedMsa && dueCents > 0 && user.role === "admin" && !demo && (
        <section className="content-section" aria-label="Check deposit">
          <div className="section-heading">
            <h2>Check deposit</h2>
          </div>
          <form
            className="form-fields"
            onSubmit={(event) => void recordCheck(event)}
          >
            <p>
              Record a check only after you have received it. The customer can
              also pay online from the signed agreement.
            </p>
            <div className="form-grid">
              <label>
                Check amount ($)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  max={(dueCents / 100).toFixed(2)}
                  step="0.01"
                  placeholder={(dueCents / 100).toFixed(2)}
                  required
                  disabled={checkBusy}
                />
              </label>
              <label>
                Check number (optional)
                <input
                  name="checkReference"
                  maxLength={100}
                  disabled={checkBusy}
                />
              </label>
            </div>
            {checkError && (
              <p role="alert" className="alert">
                {checkError}
              </p>
            )}
            <button
              type="submit"
              className="button primary"
              disabled={checkBusy}
            >
              {checkBusy ? "Recording…" : "Record received check"}
            </button>
          </form>
        </section>
      )}
      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Quote documents & photos</h2>
            <p>Keep the quote you sent and supporting files together.</p>
          </div>
        </div>
        <FilesPanel
          files={files}
          admin={user.role === "admin"}
          demo={demo}
          onUpload={async (file) => {
            await onUpload(file, quote.id);
          }}
          onDelete={(file) => onDelete("attachment", file)}
        />
      </section>
    </div>
  );
}
