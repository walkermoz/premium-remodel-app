"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { pricebookMatches, type PricebookItem } from "@/lib/pricebook";
import { pricingBases, rateLabel, costRateLabel } from "@/lib/scope-pricing";
import type { User } from "@/lib/types";
import { Modal } from "./ui";

type Draft = {
  name: string;
  description: string;
  category: string;
  unit: string;
  customerRate: string;
  subUnit: string;
  subRate: string;
  materialUnit: string;
  materialRate: string;
};
const blank: Draft = {
  name: "",
  description: "",
  category: "",
  unit: "job",
  customerRate: "0",
  subUnit: "job",
  subRate: "0",
  materialUnit: "job",
  materialRate: "0",
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function cents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a dollar amount with no more than two decimals.");
  const result = Math.round(Number(value) * 100);
  if (result > 100_000_000) throw new Error("A rate cannot exceed $1,000,000.");
  return result;
}
function fromItem(item: PricebookItem): Draft {
  return {
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    customerRate: String(item.customerRateCents / 100),
    subUnit: item.subUnit,
    subRate: String(item.subRateCents / 100),
    materialUnit: item.materialUnit,
    materialRate: String(item.materialRateCents / 100),
  };
}

export default function PricebookPanel({ user }: { user: User }) {
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<PricebookItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/pricebook", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not load price book.");
        setItems(body);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load price book.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const categories = useMemo(
    () => ["All", ...new Set(items.map((item) => item.category || "General"))],
    [items],
  );
  const filtered = items.filter(
    (item) =>
      (category === "All" || (item.category || "General") === category) &&
      pricebookMatches(item, search),
  );
  const selected =
    filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  function openNew() {
    setEditing(null);
    setDraft(blank);
    setError("");
    setEditorOpen(true);
  }
  function openEdit(item: PricebookItem) {
    setEditing(item);
    setDraft(fromItem(item));
    setError("");
    setEditorOpen(true);
  }
  function field(key: keyof Draft, label: string, type = "text") {
    return (
      <label key={key}>
        {label}
        <input
          type={type}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "0.01" : undefined}
          value={draft[key]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [key]: event.target.value }))
          }
          required={key === "name" || type === "number"}
        />
      </label>
    );
  }
  function unit(key: "unit" | "subUnit" | "materialUnit", label: string) {
    return (
      <label key={key}>
        {label}
        <select
          value={draft[key]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [key]: event.target.value }))
          }
        >
          {pricingBases.map((basis) => (
            <option key={basis.value} value={basis.value}>
              {basis.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        unit: draft.unit,
        customerRateCents: cents(draft.customerRate),
        subUnit: draft.subUnit,
        subRateCents: cents(draft.subRate),
        materialUnit: draft.materialUnit,
        materialRateCents: cents(draft.materialRate),
        ...(editing ? { id: editing.id, revision: editing.revision } : {}),
      };
      const response = await fetch("/api/pricebook", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save price-book item.");
      setItems((current) =>
        [...current.filter((item) => item.id !== body.id), body].sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.name.localeCompare(b.name),
        ),
      );
      setCategory("All");
      setSearch("");
      setSelectedId(body.id);
      setDraft(blank);
      setEditing(null);
      setEditorOpen(false);
      setMessage("Price-book item saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save price-book item.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: PricebookItem) {
    if (
      !window.confirm(
        `Archive ${item.name}? Existing quote lines will stay unchanged.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pricebook", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not archive item.");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage(
        `${item.name} archived. Existing quote lines were not changed.`,
      );
      if (editing?.id === item.id) {
        setEditing(null);
        setDraft(blank);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not archive item.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading pricebook-heading">
        <div>
          <span className="eyebrow">PRICING</span>
          <h1>
            Price book<span className="heading-dot">.</span>
          </h1>
          <p>
            Standard scope and pricing for this organization. Quote items keep
            their own editable copy.
          </p>
        </div>
        {user.role === "admin" && (
          <button className="button primary" type="button" onClick={openNew}>
            <Plus size={16} /> New item
          </button>
        )}
      </div>
      {error && !editorOpen && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success-note" role="status">
          {message}
        </div>
      )}
      <div className="pricebook-toolbar">
        <label className="pricebook-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search price book"
            placeholder="Search name, code or scope"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span>
          {filtered.length} of {items.length} items
        </span>
      </div>
      <div className="pricebook-categories" aria-label="Price book categories">
        {categories.map((name) => (
          <button
            type="button"
            key={name}
            className={category === name ? "active" : ""}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="pricebook-empty">Loading price book…</p>
      ) : items.length === 0 ? (
        <div className="pricebook-empty-state">
          <h2>No price-book items yet</h2>
          <p>
            Save a standard work item once, then add it to quotes with the
            quantity for each job.
          </p>
          {user.role === "admin" && (
            <button
              className="button secondary"
              type="button"
              onClick={openNew}
            >
              Add first item
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="pricebook-empty">No items match these filters.</p>
      ) : (
        <div className="pricebook-workspace">
          <div className="pricebook-list" aria-label="Price-book items">
            <div className="pricebook-list-head">
              <span>Work item</span>
              <span>Quote rate</span>
            </div>
            {filtered.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`pricebook-list-row ${selected?.id === item.id ? "selected" : ""}`}
                aria-pressed={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.code} · {item.category || "General"}
                  </small>
                </span>
                <span>
                  <b>{money(item.customerRateCents)}</b>
                  <small>{rateLabel(item.unit)}</small>
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <aside
              className="pricebook-inspector"
              aria-label="Selected price-book item"
            >
              <span className="pricebook-code">{selected.code}</span>
              <h2>{selected.name}</h2>
              <p>{selected.description || "No default scope description."}</p>
              <dl>
                <div>
                  <dt>{rateLabel(selected.unit)}</dt>
                  <dd>{money(selected.customerRateCents)}</dd>
                </div>
                <div>
                  <dt>{costRateLabel(selected.subUnit)} · Sub</dt>
                  <dd>{money(selected.subRateCents)}</dd>
                </div>
                <div>
                  <dt>{costRateLabel(selected.materialUnit)} · Materials</dt>
                  <dd>{money(selected.materialRateCents)}</dd>
                </div>
              </dl>
              {user.role === "admin" && (
                <div className="pricebook-inspector-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => openEdit(selected)}
                  >
                    Edit item
                  </button>
                  <button
                    type="button"
                    className="pricebook-archive"
                    disabled={busy}
                    onClick={() => void remove(selected)}
                  >
                    Archive
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
      {editorOpen && (
        <Modal
          title={editing ? "Edit price-book item" : "New price-book item"}
          subtitle="Set standard rates here. Each quote can adjust them for the job."
          onClose={() => {
            if (!busy) {
              setEditorOpen(false);
              setError("");
            }
          }}
        >
          <form onSubmit={save}>
            <div className="pricebook-editor-body">
              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}
              <div className="form-grid">
                {field("name", "Work item")}
                {field("category", "Category")}
              </div>
              <label>
                Default scope description
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <fieldset>
                <legend>Quote price</legend>
                <div className="form-grid">
                  {unit("unit", "Price by")}
                  {field(
                    "customerRate",
                    `${rateLabel(draft.unit)} ($)`,
                    "number",
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend>Subcontractor cost</legend>
                <div className="form-grid">
                  {unit("subUnit", "Cost by")}
                  {field(
                    "subRate",
                    `${costRateLabel(draft.subUnit)} ($)`,
                    "number",
                  )}
                </div>
              </fieldset>
              <fieldset>
                <legend>Material cost</legend>
                <div className="form-grid">
                  {unit("materialUnit", "Cost by")}
                  {field(
                    "materialRate",
                    `${costRateLabel(draft.materialUnit)} ($)`,
                    "number",
                  )}
                </div>
              </fieldset>
              <p className="pricebook-code-note">
                Reference code is assigned automatically when this item is
                saved.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create item"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
