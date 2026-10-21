"use client";

import { useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { projectMoney } from "@/lib/project-finances";
import { importedQuoteSchema, type ImportedQuote } from "@/lib/quote-import";
import { readQuotePdf } from "@/lib/quote-pdf-text";
import { Modal } from "./ui";

export default function QuoteImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (quotes: ImportedQuote[]) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<ImportedQuote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = (quote: ImportedQuote) =>
    quote.rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) /
    100;
  const mismatched = drafts.some(
    (quote) => Math.abs(total(quote) - quote.expectedTotal) > 0.01,
  );

  async function addFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    if (files.length + drafts.length > 5) {
      setError("Import up to five PDFs at a time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next: ImportedQuote[] = [];
      for (const file of Array.from(files)) {
        const pages = await readQuotePdf(file);
        const response = await fetch("/api/quotes/import-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, pages }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            `${file.name}: ${result.error || "Could not read proposal."}`,
          );
        next.push(importedQuoteSchema.parse(result));
      }
      setDrafts((current) => [...current, ...next]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read these PDFs.",
      );
    } finally {
      if (input.current) input.current.value = "";
      setBusy(false);
    }
  }
  function changeDraft(index: number, patch: Partial<ImportedQuote>) {
    setDrafts((current) =>
      current.map((draft, position) =>
        position === index ? { ...draft, ...patch } : draft,
      ),
    );
  }
  async function save() {
    if (!drafts.length || busy || mismatched) return;
    setBusy(true);
    setError("");
    try {
      const parsed = drafts.map((draft) => importedQuoteSchema.parse(draft));
      await onImport(parsed);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not import the quotes.",
      );
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Import existing quotes"
      subtitle="Choose up to five text-based PDF proposals. Review the customer, scope rows and totals before saving drafts."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="quote-import-body">
        <input
          ref={input}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button
          className="quote-import-drop"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addFiles(event.dataTransfer.files);
          }}
        >
          <FileUp size={22} />
          <strong>
            {busy
              ? "Reading proposals…"
              : "Drop PDF proposals here or choose files"}
          </strong>
          <span>Text-based PDFs up to 20 MB each · up to five at once</span>
        </button>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {drafts.map((draft, index) => (
          <section
            className="quote-import-preview"
            key={`${draft.fileName}-${index}`}
          >
            <div className="quote-import-preview-head">
              <div>
                <small>{draft.fileName}</small>
                <h3>Quote {index + 1}</h3>
              </div>
              <button
                className="icon-button"
                aria-label={`Remove ${draft.fileName}`}
                disabled={busy}
                onClick={() =>
                  setDrafts((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="quote-import-fields">
              <label>
                Quote name
                <input
                  value={draft.name}
                  disabled={busy}
                  onChange={(event) =>
                    changeDraft(index, { name: event.target.value })
                  }
                />
              </label>
              <label>
                Customer
                <input
                  value={draft.client}
                  disabled={busy}
                  onChange={(event) =>
                    changeDraft(index, { client: event.target.value })
                  }
                />
              </label>
              <label>
                Project type
                <select
                  value={draft.category}
                  disabled={busy}
                  onChange={(event) =>
                    changeDraft(index, {
                      category: event.target.value as ImportedQuote["category"],
                    })
                  }
                >
                  {[
                    "Kitchen",
                    "Bathroom",
                    "Basement",
                    "Outdoor",
                    "Whole home",
                    "Other",
                  ].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Project address
                <input
                  value={draft.address}
                  disabled={busy}
                  onChange={(event) =>
                    changeDraft(index, { address: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="quote-import-rows">
              {draft.rows.map((row, rowIndex) => (
                <div className="quote-import-row" key={rowIndex}>
                  {(rowIndex === 0 ||
                    draft.rows[rowIndex - 1].sectionName !==
                      row.sectionName) && (
                    <strong className="quote-import-section">
                      {row.sectionName}
                    </strong>
                  )}
                  <input
                    aria-label={`Line item ${rowIndex + 1}`}
                    value={row.title}
                    disabled={busy}
                    onChange={(event) =>
                      changeDraft(index, {
                        rows: draft.rows.map((entry, position) =>
                          position === rowIndex
                            ? { ...entry, title: event.target.value }
                            : entry,
                        ),
                      })
                    }
                  />
                  <label>
                    <span>$</span>
                    <input
                      aria-label={`Amount for ${row.title}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      disabled={busy}
                      onChange={(event) =>
                        changeDraft(index, {
                          rows: draft.rows.map((entry, position) =>
                            position === rowIndex
                              ? { ...entry, amount: Number(event.target.value) }
                              : entry,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div
              className={`quote-import-total ${Math.abs(total(draft) - draft.expectedTotal) > 0.01 ? "mismatch" : ""}`}
            >
              <span>{draft.rows.length} priced rows · Parsed total</span>
              <strong>{projectMoney(total(draft))}</strong>
              <small>PDF total {projectMoney(draft.expectedTotal)}</small>
            </div>
          </section>
        ))}
        {mismatched && (
          <p className="quote-import-warning">
            A row total differs from its PDF total. Correct the amounts before
            importing.
          </p>
        )}
      </div>
      <div className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || !drafts.length || mismatched}
          onClick={() => void save()}
        >
          {busy
            ? "Working…"
            : `Import ${drafts.length} ${drafts.length === 1 ? "quote" : "quotes"}`}
        </button>
      </div>
    </Modal>
  );
}
