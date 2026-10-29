"use client";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  FileUp,
  RotateCcw,
  Trash2,
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
import {
  projectFinances,
  projectMoney,
  scopeTotal,
} from "@/lib/project-finances";
import { msaPaymentRows } from "@/lib/msa-contract";
import { DEFAULT_QUOTE_PROJECT_NAME } from "@/lib/scope-projects";
import { orderedScopeItems } from "@/lib/scope-order";
import { dateLabel } from "@/lib/utils";
import { Empty } from "./ui";
import type { Editor } from "./entity-form";
import ScopeTable from "./scope-table";
import FilesPanel from "./files-panel";
import QuotePhotosPanel from "./quote-photos-panel";
import QuoteImportDialog from "./quote-import-dialog";
import MsaDraftPanel from "./msa-draft-panel";
import type { ImportedQuote } from "@/lib/quote-import";
import QuoteProjectHandoffDemo from "./quote-project-handoff-demo";
import { QUOTE_HANDOFF_DEMO_ID } from "@/lib/demo-quote-handoff";
import QuoteWorkflowStepper, {
  type QuoteWorkflowStep,
} from "./quote-workflow-stepper";
import MsaSigningPanel from "./msa-signing-panel";
import RoomScansPanel from "./room-scans-panel";

export default function QuotesPanel({
  workspace,
  search,
  onNew,
  onOpen,
  onImport,
  onSaveQuote,
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
  onSaveQuote: (
    data: Record<string, unknown>,
    quote: Quote,
  ) => Promise<unknown>;
  demo: boolean;
}) {
  const [filter, setFilter] = useState("All quotes");
  const [importOpen, setImportOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [actionError, setActionError] = useState("");
  const quotes = workspace.quotes || [];
  const activeQuotes = quotes.filter((quote) => !quote.junkedAt);
  const visible = quotes
    .filter(
      (quote) =>
        (filter === "Junk"
          ? Boolean(quote.junkedAt)
          : !quote.junkedAt &&
            (filter === "All quotes" || quote.status === filter)) &&
        `${quote.name} ${quote.client} ${quote.address} ${quote.clientEmail || ""} ${quote.clientPhone || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sent = activeQuotes.filter((quote) => quote.status === "Sent");
  const sentCount = activeQuotes.filter((quote) =>
    Boolean(quote.quoteSentAt),
  ).length;
  const wonCount =
    workspace.projects.filter((project) => Boolean(project.quoteAcceptedAt))
      .length +
    activeQuotes.filter((quote) => quote.status === "Accepted").length;
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
        {["All quotes", ...quoteStatuses, "Junk"].map((status) => (
          <button
            key={status}
            className={status === filter ? "active" : ""}
            aria-pressed={status === filter}
            onClick={() => setFilter(status)}
          >
            {status}
            <span>
              {status === "All quotes"
                ? activeQuotes.length
                : status === "Junk"
                  ? quotes.filter((quote) => Boolean(quote.junkedAt)).length
                  : activeQuotes.filter((quote) => quote.status === status)
                      .length}
            </span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="quote-list">
          {visible.map((quote) => {
            const isJunk = Boolean(quote.junkedAt);
            return (
              <div className="quote-row" key={quote.id}>
                <button
                  type="button"
                  className="quote-row-open"
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
                </button>
                <button
                  type="button"
                  className={`row-junk-action ${isJunk ? "restore" : ""}`}
                  aria-label={
                    isJunk
                      ? `Restore ${quote.name} to quotes`
                      : `Move ${quote.name} to junk`
                  }
                  title={isJunk ? "Restore to Quotes" : "Move to Junk"}
                  disabled={savingId === quote.id}
                  onClick={async () => {
                    setSavingId(quote.id);
                    setActionError("");
                    try {
                      await onSaveQuote(
                        {
                          ...quote,
                          junkedAt: isJunk ? null : new Date().toISOString(),
                        },
                        quote,
                      );
                    } catch (error) {
                      setActionError(
                        error instanceof Error
                          ? error.message
                          : "Could not update this quote.",
                      );
                    } finally {
                      setSavingId("");
                    }
                  }}
                >
                  {isJunk ? (
                    <RotateCcw size={16} aria-hidden="true" />
                  ) : (
                    <Trash2 size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
            );
          })}
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
      {actionError && (
        <div className="alert quote-list-alert" role="alert">
          {actionError}
        </div>
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
  config,
  demo,
  onBack,
  onEdit,
  onSave,
  onReorderScope,
  onPriceScope,
  onAccept,
  onDelete,
  onUpload,
  onSent,
  onProjectReady,
}: {
  quote: Quote;
  workspace: Workspace;
  user: User;
  config: import("@/lib/business-config").BusinessConfig;
  demo: boolean;
  onBack: () => void;
  onEdit: (editor: Editor) => void;
  onSave: (
    kind: EntityKind,
    data: Record<string, unknown>,
    entity?: Entity,
  ) => Promise<Entity>;
  onReorderScope: (
    quoteId: string,
    items: ScopeItem[],
    movingId: string,
  ) => Promise<ScopeItem[]>;
  onPriceScope: (
    quoteId: string,
    items: ScopeItem[],
    subMultiplier: number,
    materialMultiplier: number,
  ) => Promise<ScopeItem[]>;
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
  const items = orderedScopeItems(
    workspace.scope.filter((item) => item.projectId === quote.id),
  );
  const files = workspace.attachments.filter(
    (file) => file.projectId === quote.id,
  );
  const finances = projectFinances(quote, items);
  const overviewPhotos = (quote.quotePhotos || [])
    .flatMap((photo) => {
      const file = files.find(
        (candidate) => candidate.id === photo.attachmentId,
      );
      return file ? [{ photo, file }] : [];
    })
    .slice(0, 2);
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
  const handoffDemo = quote.id === QUOTE_HANDOFF_DEMO_ID;
  const [workflowStep, setWorkflowStep] = useState<QuoteWorkflowStep>(() =>
    readyForProjects ? "project" : quote.quoteSentAt ? "completion" : "quote",
  );
  const quoteDetailsReady = Boolean(
    quote.client.trim() && quote.clientEmail?.trim() && items.length,
  );
  const agreementDetailsReady = Boolean(
    quote.msaPaymentSchedule?.length &&
    quote.msaPermitResponsibility &&
    quote.msaContractTerms,
  );
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
          "Connect the company mailbox in Settings before sending a quote.",
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
  const msaDraftPanel =
    items.length && config.features.agreements ? (
      <MsaDraftPanel
        key={`${quote.id}:${JSON.stringify(quote.msaPaymentSchedule)}:${quote.msaPermitResponsibility || ""}:${JSON.stringify(quote.msaContractTerms)}`}
        project={quote}
        items={items}
        signer={user}
        showSigning={false}
        canSendAgreement={signedScope}
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
    ) : null;
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
          </div>
          <div className="quote-header-contact">
            <strong>{quote.client || "No client added"}</strong>
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
        <div className="project-actions quote-header-actions">
          {!demo &&
            quote.clientEmail &&
            !signedScope &&
            workflowStep === "completion" && (
              <button
                className="button primary"
                disabled={busy || sendBusy}
                onClick={() => void openEmail()}
              >
                <Mail size={15} /> Email quote
              </button>
            )}
          <div className="quote-header-status">
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
            {quote.quoteSentAt && (
              <small>Last sent {dateLabel(quote.quoteSentAt)}</small>
            )}
          </div>
          <a
            className="button secondary"
            href={`/api/quotes/${encodeURIComponent(quote.id)}/pdf`}
            download
          >
            <Download size={15} />
            Download PDF
          </a>
          {!signedScope && (handoffDemo || workflowStep === "quote") && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onEdit({ kind: "quote", entity: quote })}
            >
              <Pencil size={15} /> Edit quote
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
                  We’ll attach the quote PDF and include a private link to view
                  it in the client portal. The email will be sent from this
                  organization’s connected Gmail account.
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
                  defaultValue={`${config.profile.name} Quote${quote.quoteNumber ? ` #${quote.quoteNumber}` : ""}`}
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Message
                <textarea
                  name="message"
                  defaultValue={`Hi ${quote.client || "there"},\n\nAttached is your ${config.profile.name} quote. You can also view it in your client portal using the link below. Please review it and reply with any questions.\n\nThanks,\n${config.profile.name} Team`}
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
      <div className="quote-overview">
        <div
          className={`quote-overview-metrics${config.quotePreferences.showInternalCosts ? "" : " quote-overview-metrics-solo"}`}
        >
          <div className="quote-overview-metric quote-price">
            <span>Scope total · quote price</span>
            <strong>{projectMoney(finances.total)}</strong>
            <small>{items.length} items</small>
          </div>
          {config.quotePreferences.showInternalCosts && (
            <div className="quote-overview-metric">
              <span>Total costs</span>
              <strong>{projectMoney(finances.costs)}</strong>
            </div>
          )}
          {config.quotePreferences.showInternalCosts && (
            <div className="quote-overview-metric">
              <span>Profit</span>
              <strong
                className={finances.margin < 0 ? "is-negative" : undefined}
              >
                {projectMoney(finances.margin)}
              </strong>
            </div>
          )}
        </div>
        {overviewPhotos.length > 0 && (
          <div
            className="quote-overview-photos"
            aria-label="Selected quote photos"
          >
            {overviewPhotos.map(({ photo, file }) => {
              const label =
                photo.kind === "before"
                  ? "Before"
                  : photo.kind === "concept"
                    ? "AI concept"
                    : "Example";
              return (
                <figure key={file.id}>
                  <img
                    src={
                      demo
                        ? file.path
                        : `/api/files?id=${encodeURIComponent(file.id)}`
                    }
                    alt={photo.caption || `${label} photo`}
                    title={photo.caption || file.name}
                  />
                  <figcaption>{label}</figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>
      {handoffDemo && quote.quoteSentAt && (
        <QuoteProjectHandoffDemo
          quote={quote}
          itemCount={items.length}
          fileCount={files.length}
          agreementDetails={msaDraftPanel}
        />
      )}
      {!handoffDemo && (
        <QuoteWorkflowStepper
          active={workflowStep}
          agreementReady={quoteDetailsReady}
          completionReady={agreementDetailsReady}
          projectReady={readyForProjects}
          onSelect={setWorkflowStep}
        />
      )}
      {(handoffDemo || workflowStep === "quote") && quote.description && (
        <section className="content-section">
          <div className="section-heading">
            <h2>Scope brief</h2>
          </div>
          <p className="scope-description">{quote.description}</p>
        </section>
      )}
      {!demo && workflowStep === "quote" && (
        <RoomScansPanel quoteId={quote.id} readOnly={signedScope} />
      )}
      {(handoffDemo || workflowStep === "quote") && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Scope & pricing</h2>
              <p>
                {signedScope
                  ? "Signed scope is locked."
                  : "Edit a row, or drag its handle to change the quote order."}
              </p>
            </div>
          </div>
          {signedScope ? (
            <table className="scope-table" aria-label="Signed quote scope">
              <thead>
                <tr>
                  <th>Item</th>
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
              pricebookEnabled={
                config.features.priceBook &&
                config.quotePreferences.showPriceBookPicker
              }
              demoPricebook={demo}
              showInternalCosts={config.quotePreferences.showInternalCosts}
              inline
              compactQuoteRows
              showStatus={false}
              projectId={quote.id}
              defaultSectionName={DEFAULT_QUOTE_PROJECT_NAME}
              onSave={(data, item) => onSave("scope", data, item)}
              onReorder={onReorderScope}
              onBulkPrice={onPriceScope}
              onDelete={(item) => onDelete("scope", item)}
            />
          )}
        </section>
      )}
      {!handoffDemo && workflowStep === "agreement" && (
        <section className="workflow-live-step" aria-label="Agreement details">
          <header>
            <span className="project-handoff-eyebrow">Step 2</span>
            <h2>Agreement details</h2>
            <p>
              Confirm payment milestones, contract terms, dates, and parties
              before anything is sent for signature.
            </p>
          </header>
          {msaDraftPanel || (
            <div className="alert">Add at least one quote item first.</div>
          )}
          <footer>
            <button
              type="button"
              className="button secondary"
              onClick={() => setWorkflowStep("quote")}
            >
              Back to quote
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!agreementDetailsReady}
              onClick={() => setWorkflowStep("completion")}
            >
              Continue to send & complete
            </button>
          </footer>
        </section>
      )}
      {!handoffDemo && workflowStep === "completion" && (
        <section className="workflow-live-step" aria-label="Send and complete">
          <header>
            <span className="project-handoff-eyebrow">Step 3</span>
            <h2>Send & complete</h2>
            <p>
              Deliver the quote through email and the client portal, then track
              the quote signature, service agreement, and deposit here.
            </p>
          </header>
          <div
            className="handoff-communication"
            aria-label="Customer delivery and communication"
          >
            <div>
              <span className="handoff-communication-icon">
                <Mail size={16} aria-hidden="true" />
              </span>
              <div>
                <small>Email delivery</small>
                <strong>
                  {quote.quoteSentAt
                    ? `Sent to ${quote.clientEmail}`
                    : "Ready to send with the quote PDF attached"}
                </strong>
              </div>
            </div>
            <div>
              <span className="handoff-communication-icon">
                <FileText size={16} aria-hidden="true" />
              </span>
              <div>
                <small>Client portal</small>
                <strong>
                  {quote.quoteSentAt
                    ? "Private quote link active"
                    : "Created when the quote is emailed"}
                </strong>
              </div>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={!quote.clientEmail || sendBusy}
              onClick={() => void openEmail()}
            >
              <Mail size={15} />
              {quote.quoteSentAt ? "Resend quote" : "Email quote"}
            </button>
          </div>
          <div className="workflow-completion-status-grid">
            <section className="workflow-status-row">
              <span className={signedScope ? "is-complete" : ""}>
                {signedScope ? <Check size={14} /> : "1"}
              </span>
              <div>
                <strong>Quote accepted and signed</strong>
                <small>
                  {signedScope
                    ? `Signed by ${quote.quoteAcceptedBy || quote.client}`
                    : quote.quoteSentAt
                      ? "Waiting for the customer in the portal"
                      : "Email the quote to begin"}
                </small>
              </div>
            </section>
            <section className="workflow-status-row">
              <span className={signedMsa ? "is-complete" : ""}>
                {signedMsa ? <Check size={14} /> : "2"}
              </span>
              <div>
                <strong>Service agreement signed</strong>
                <small>
                  {signedMsa
                    ? `Signed by ${quote.msaAgreement?.customerSignature?.name || quote.client}`
                    : signedScope
                      ? "Staff signature and customer signature required"
                      : "Unlocks after quote acceptance"}
                </small>
              </div>
            </section>
            <section className="workflow-status-row">
              <span className={readyForProjects ? "is-complete" : ""}>
                {readyForProjects ? <Check size={14} /> : "3"}
              </span>
              <div>
                <strong>Deposit received</strong>
                <small>
                  {readyForProjects
                    ? "Required deposit recorded"
                    : signedMsa
                      ? `${projectMoney(dueCents / 100)} remaining`
                      : "Available after agreement signature"}
                </small>
              </div>
            </section>
          </div>
          {config.features.agreements && (
            <MsaSigningPanel
              quote={quote}
              signerName={user.name}
              onSent={onSent}
            />
          )}
        </section>
      )}
      {config.features.agreements &&
        signedMsa &&
        dueCents > 0 &&
        user.role === "admin" &&
        !demo &&
        workflowStep === "completion" && (
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
      {!handoffDemo && workflowStep === "project" && (
        <section className="workflow-live-step" aria-label="Create project">
          <header>
            <span className="project-handoff-eyebrow">Step 4</span>
            <h2>Create project</h2>
            <p>
              The signed quote, agreement, deposit, customer, files, and items
              will move together into Projects.
            </p>
          </header>
          <div className="workflow-project-review">
            <div>
              <span>Project</span>
              <strong>{quote.name}</strong>
              <small>{quote.address}</small>
            </div>
            <div>
              <span>Customer</span>
              <strong>{quote.client}</strong>
              <small>{quote.clientEmail}</small>
            </div>
            <div>
              <span>Contract</span>
              <strong>
                {projectMoney(quote.contractPrice || finances.total)}
              </strong>
              <small>{items.length} items ready for Planning</small>
            </div>
          </div>
          <ul className="workflow-project-items" aria-label="Project items">
            {items.map((item, index) => (
              <li key={item.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.sectionName || quote.category}</small>
                </div>
                <Check size={15} aria-label="Ready" />
              </li>
            ))}
          </ul>
          <footer>
            <button
              type="button"
              className="button secondary"
              onClick={() => setWorkflowStep("completion")}
            >
              Back to completion
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || !readyForProjects}
              onClick={() => void change(() => onAccept(quote))}
            >
              <Check size={16} /> {busy ? "Creating…" : "Create project"}
            </button>
          </footer>
        </section>
      )}
      {(handoffDemo || workflowStep === "quote") && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Quote photos</h2>
              <p>
                Choose before and example photos to show your customer, or
                create a finished concept.
              </p>
              {quote.quoteSentAt && (
                <p>Resend the quote to update photos in the customer copy.</p>
              )}
            </div>
          </div>
          <QuotePhotosPanel
            quote={quote}
            files={files}
            demo={demo}
            onSave={(photos) =>
              onSave("quote", { ...quote, quotePhotos: photos }, quote)
            }
            onUpload={(file) => onUpload(file, quote.id)}
            onDelete={(file) => onDelete("attachment", file)}
            admin={user.role === "admin"}
          />
          <FilesPanel
            files={files.filter((file) => !file.mime.startsWith("image/"))}
            admin={user.role === "admin"}
            demo={demo}
            hideEmpty
            onUpload={async (file) => {
              await onUpload(file, quote.id);
            }}
            onDelete={(file) => onDelete("attachment", file)}
          />
        </section>
      )}
    </div>
  );
}
