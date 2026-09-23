"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
import {
  quoteStatuses,
  type Attachment,
  type Entity,
  type EntityKind,
  type Quote,
  type User,
  type Workspace,
} from "@/lib/types";
import { projectMoney, scopeTotal } from "@/lib/project-finances";
import { dateLabel } from "@/lib/utils";
import { Empty } from "./ui";
import type { Editor } from "./entity-form";
import ScopeTable from "./scope-table";
import FilesPanel from "./files-panel";

export default function QuotesPanel({
  workspace,
  search,
  onNew,
  onOpen,
}: {
  workspace: Workspace;
  search: string;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState("All quotes");
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
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BEFORE THE WORK BEGINS</span>
          <h1>
            Quotes<span className="heading-dot">.</span>
          </h1>
          <p>
            Track leads and sent quotes. Accept a quote to move it into
            Projects.
          </p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          New quote
        </button>
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
  onAccept,
  onDelete,
  onUpload,
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
  onAccept: (quote: Quote) => Promise<void>;
  onDelete: (kind: EntityKind, entity: Entity) => void;
  onUpload: (file: File, projectId: string) => Promise<Attachment>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const items = workspace.scope.filter((item) => item.projectId === quote.id);
  const files = workspace.attachments.filter(
    (file) => file.projectId === quote.id,
  );
  const addScope = () => onEdit({ kind: "scope", projectId: quote.id });
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
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => onEdit({ kind: "quote", entity: quote })}
          >
            <Pencil size={15} />
            Edit quote
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void change(() => onAccept(quote))}
          >
            <Check size={16} />
            {busy ? "Saving…" : "Accept quote"}
          </button>
        </div>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
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
            disabled={busy}
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
            {quoteStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        {quote.status !== "Sent" && (
          <button
            className="button secondary small-button"
            disabled={busy}
            onClick={() =>
              void change(() =>
                onSave("quote", { ...quote, status: "Sent" }, quote),
              )
            }
          >
            Mark as sent
          </button>
        )}
        {quote.quoteSentAt && (
          <span className="muted">
            Last sent {dateLabel(quote.quoteSentAt)}
          </span>
        )}
      </div>
      <p className="footnote">
        Mark as sent after sharing the quote with the client. Accept quote moves
        this scope and its files into a new planning project.
      </p>
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
            <p>Line item prices make up the quote total.</p>
          </div>
          <button className="button secondary small-button" onClick={addScope}>
            <Plus size={15} />
            Add item
          </button>
        </div>
        <ScopeTable
          items={items}
          workspace={workspace}
          onAdd={addScope}
          onEdit={(item) => onEdit({ kind: "scope", entity: item })}
          onDelete={(item) => onDelete("scope", item)}
        />
      </section>
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
